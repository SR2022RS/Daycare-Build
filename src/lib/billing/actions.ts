"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { todayISO } from "@/lib/billing/dates";
import { CHARGE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/billing/labels";
import { overpaymentExcess } from "@/lib/billing/overpayment";
import { createClient } from "@/lib/supabase/server";
import type { ChargeType, PaymentMethod } from "@/types/database.types";

export type BillingActionState = { message?: string } | undefined;

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function num(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function recordPayment(
  _state: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await requireRole(["director", "platform_admin"]);

  const invoiceId = str(formData, "invoiceId");
  const amount = num(formData, "amount");
  const method = str(formData, "method") as PaymentMethod | null;
  const paidAt = str(formData, "paidAt");

  if (!invoiceId || amount === null || !method || !paidAt) {
    return { message: "Enter an amount, method, and payment date." };
  }
  if (!(method in PAYMENT_METHOD_LABELS)) {
    return { message: "Choose a valid payment method." };
  }
  if (amount <= 0) {
    return { message: "Payment amount must be greater than zero." };
  }

  const supabase = await createClient();

  // invoiceId arrives from a hidden form field, so it must be verified to
  // belong to this director's own tenant before inserting -- payments_write
  // only checks the payment row's own tenant_id (supplied by us, below,
  // from the session, so it always passes), not that invoiceId actually
  // points at an invoice in that tenant. Without this pre-check, a director
  // holding another tenant's invoice UUID could post a payment against it
  // and the recalc trigger would rewrite that tenant's invoice totals.
  // Mirrors the ownership check in addManualCharge above.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("tenant_id", session.profile.tenantId)
    .maybeSingle();

  if (!invoice) return { message: "You don't have access to this invoice." };

  const { data, error } = await supabase
    .from("payments")
    .insert({
      tenant_id: session.profile.tenantId,
      invoice_id: invoiceId,
      amount,
      method,
      paid_at: paidAt,
      recorded_by: session.profile.id,
      note: str(formData, "note"),
    })
    .select("id")
    .maybeSingle();

  if (error) return { message: "Couldn't record that payment. Try again." };
  if (!data) return { message: "You don't have access to this invoice." };

  // Invoice totals (total_amount/amount_paid/status) are trigger-maintained
  // by 20260814120300_billing_recalc_triggers.sql on every charges/payments
  // write -- no manual recalc call here. Don't re-add one: the RPC is
  // revoked from every REST role (see the migration for why), so a manual
  // call would silently fail again.
  revalidatePath("/billing");
  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing/revenue");
  revalidatePath("/dashboard");
}

// Spec §91/§141: an overpayment becomes a credit-type charge carried onto
// the guardian's next invoice, rather than an invisible excess (every
// balance figure in the app clamps at 0). Director-initiated by design --
// nothing financial happens without an explicit click on the amber banner's
// button in /billing/[invoiceId]/page.tsx.
export async function applyOverpaymentCredit(
  _state: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await requireRole(["director", "platform_admin"]);

  const invoiceId = str(formData, "invoiceId");
  if (!invoiceId) return { message: "Missing invoice." };

  const supabase = await createClient();

  // invoiceId arrives from a hidden form field, so it must be verified to
  // belong to this director's own tenant before use -- charges_write only
  // checks the new charge row's own tenant_id (supplied by us, below, from
  // the session, so it always passes), not that invoiceId actually points
  // at an invoice in that tenant. Without this pre-check, a director
  // holding another tenant's invoice UUID could apply a credit against it.
  // Mirrors the ownership check in recordPayment above. The excess amount
  // is deliberately never read from the client -- it is re-derived here
  // from the invoice's own stored total_amount/amount_paid, the same values
  // recalc_invoice_totals maintains, so a tampered form field can never
  // create a credit for more (or less) than the invoice actually overpaid.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, guardian_id, location_id, total_amount, amount_paid, period_start, period_end")
    .eq("id", invoiceId)
    .eq("tenant_id", session.profile.tenantId)
    .maybeSingle();

  if (!invoice) return { message: "You don't have access to this invoice." };

  const excess = overpaymentExcess(invoice.total_amount, invoice.amount_paid);
  if (excess <= 0) return { message: "This invoice isn't overpaid." };

  const { data, error } = await supabase
    .from("charges")
    .insert({
      tenant_id: session.profile.tenantId,
      location_id: invoice.location_id,
      child_id: null,
      guardian_id: invoice.guardian_id,
      invoice_id: null, // Unattached -- the generator adopts it onto the family's next invoice.
      type: "credit",
      // Negative: credits reduce what's owed. The
      // charges_tuition_parent_amount_non_negative constraint only applies
      // to type = 'tuition', so a negative parent_amount here is permitted.
      parent_amount: -excess,
      subsidy_amount: 0,
      source_invoice_id: invoiceId,
      created_by: session.profile.id,
      description: `Credit from overpayment on invoice ${invoice.period_start}–${invoice.period_end}`,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation on charges_source_invoice_key: a credit was
    // already applied for this exact overpaid invoice -- most likely a
    // double-click racing this same request. Distinguish it with a truthful
    // message instead of a generic failure, since the underlying state
    // (a credit exists) is actually fine.
    if (error.code === "23505") {
      return { message: "A credit has already been applied for this overpayment." };
    }
    return { message: "Couldn't apply that credit. Try again." };
  }
  if (!data) return { message: "You don't have access to this invoice." };

  // Trigger-maintained -- see the comment in recordPayment above. This
  // credit is unattached (invoice_id null) until the next generation run,
  // so nothing on *this* invoice's totals changes; the revalidates below
  // are about the credit becoming visible (the banner flipping to "Credit
  // applied") and the guardian's pending-credit line, not a totals change.
  revalidatePath("/billing");
  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing/revenue");
  revalidatePath("/dashboard");
  revalidatePath(`/billing/guardians/${invoice.guardian_id}`);
}

export async function addManualCharge(
  _state: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await requireRole(["director", "platform_admin"]);

  const childId = str(formData, "childId");
  const type = str(formData, "type") as ChargeType | null;
  const description = str(formData, "description");
  const amount = num(formData, "amount");

  if (!childId || !type || !description || amount === null) {
    return { message: "Pick a child and type, and enter a description and amount." };
  }
  if (!(type in CHARGE_TYPE_LABELS)) {
    return { message: "Choose a valid charge type." };
  }
  if (type === "tuition") {
    return { message: "Tuition charges are generated automatically — pick fee, credit, or adjustment." };
  }

  const supabase = await createClient();

  const { data: child } = await supabase
    .from("children")
    .select("id, location_id")
    .eq("id", childId)
    .eq("tenant_id", session.profile.tenantId)
    .maybeSingle();

  if (!child) return { message: "That child isn't in your center." };

  // Credits reduce what's owed, so they're stored negative regardless of
  // how the amount was typed in. Fees are always positive. Adjustments can
  // legitimately go either way (the DB permits a negative parent_amount for
  // non-tuition charges), so their sign is passed through as entered rather
  // than forced positive.
  const signed =
    type === "credit" ? -Math.abs(amount) : type === "adjustment" ? amount : Math.abs(amount);

  const { data: payerRows } = await supabase
    .from("child_guardians")
    .select("guardian_id")
    .eq("child_id", childId)
    .eq("is_payer", true)
    .limit(1);

  const payerRow = payerRows?.[0];
  if (!payerRow) return { message: "Set a paying guardian for this child first." };

  const today = todayISO();

  // Any non-void invoice covering today for this guardian is reusable, not
  // just open/partial -- a guardian can have several overlapping invoices
  // (different children on different cadences), and a today-covering
  // invoice can also already be 'paid' (e.g. fully credited). Reusing it
  // instead of trying to open a second one for the same period avoids
  // colliding with invoices_guardian_period_key (guardian_id, period_start,
  // period_end) where status <> 'void'. ascending: false + limit(1) instead
  // of maybeSingle(): a guardian paying for multiple children can
  // legitimately have more than one row match here, and maybeSingle()
  // throws (PGRST116) rather than picking one, which -- uncaught, as it was
  // before this fix -- left `data` null and silently opened a spurious
  // extra invoice.
  const { data: openInvoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("tenant_id", session.profile.tenantId)
    .eq("guardian_id", payerRow.guardian_id)
    .neq("status", "void")
    .lte("period_start", today)
    .gte("period_end", today)
    .order("period_start", { ascending: false })
    .limit(1);

  let invoiceId = openInvoices?.[0]?.id ?? null;

  if (!invoiceId) {
    const { data: created, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        tenant_id: session.profile.tenantId,
        location_id: child.location_id,
        guardian_id: payerRow.guardian_id,
        period_start: today,
        period_end: today,
        due_date: today,
      })
      .select("id")
      .maybeSingle();

    // 23505 = unique_violation: lost a race against a concurrent manual
    // charge (or the cron/"Generate now" generator) opening the same
    // guardian+period invoice at the same moment. Rather than surfacing a
    // permanent "couldn't open an invoice" error, recover the same way
    // generate_recurring_charges_impl does at
    // 20260814120100_billing_generation.sql:236-245: re-select and use
    // whichever invoice won the race. (A supabase-js upsert with
    // ignoreDuplicates targeting invoices_guardian_period_key isn't usable
    // here -- that index is partial (`where status <> 'void'`), and
    // PostgREST's on_conflict param only accepts a column list with no way
    // to repeat the index's predicate, so Postgres would reject the
    // conflict target on every insert, not just real conflicts. A plain
    // insert with an explicit unique_violation catch is the safe
    // equivalent.)
    if (invoiceError && invoiceError.code !== "23505") {
      return { message: "Couldn't open an invoice for this family." };
    }

    invoiceId = created?.id ?? null;

    if (!invoiceId) {
      const { data: existing } = await supabase
        .from("invoices")
        .select("id")
        .eq("tenant_id", session.profile.tenantId)
        .eq("guardian_id", payerRow.guardian_id)
        .neq("status", "void")
        .lte("period_start", today)
        .gte("period_end", today)
        .order("period_start", { ascending: false })
        .limit(1);
      invoiceId = existing?.[0]?.id ?? null;
    }

    if (!invoiceId) return { message: "Couldn't open an invoice for this family." };
  }

  const { error } = await supabase.from("charges").insert({
    tenant_id: session.profile.tenantId,
    location_id: child.location_id,
    child_id: childId,
    invoice_id: invoiceId,
    type,
    description,
    subsidy_amount: 0,
    parent_amount: signed,
    created_by: session.profile.id,
  });

  if (error) return { message: "Couldn't add that charge. Try again." };

  // Trigger-maintained -- see the comment in recordPayment above.
  revalidatePath("/billing");
  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing/revenue");
}

export async function voidCharge(formData: FormData) {
  await requireRole(["director", "platform_admin"]);

  const chargeId = str(formData, "chargeId");
  if (!chargeId) return;

  const supabase = await createClient();

  // .select(...).maybeSingle() after the write, not a bare .update(): RLS
  // blocks a write by matching zero rows rather than raising an error, so
  // without this an RLS-blocked void would silently report success. The
  // returned invoice_id/guardian_id are used (below) instead of trusting
  // whatever the client submitted in the form, and totals recalc
  // automatically via the triggers in
  // 20260814120300_billing_recalc_triggers.sql. guardian_id is only ever
  // non-null on a family-level overpayment credit (charges_child_or_guardian
  // in 20260814120600_overpayment_credits.sql) -- ordinary child-scoped
  // charges leave it null, so the extra revalidate below is a no-op for
  // every void except a credit's.
  const { data, error } = await supabase
    .from("charges")
    .update({ void: true, voided_at: new Date().toISOString() })
    .eq("id", chargeId)
    .select("invoice_id, guardian_id")
    .maybeSingle();

  if (error || !data) return;

  const invoiceId = data.invoice_id;
  const guardianId = data.guardian_id;

  revalidatePath("/billing");
  // A voided charge with no invoice yet is an unattached family credit --
  // e.g. voided from the "Pending credit" line on the guardian's balance
  // page before any generation run has attached it (invoice_id is still
  // null at that point, so there is no /billing/<invoiceId> page to
  // revalidate). Revalidate the guardian's own balance page instead so the
  // voided line disappears immediately.
  if (invoiceId) revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing/revenue");
  if (guardianId) revalidatePath(`/billing/guardians/${guardianId}`);
}

export async function generateNow(
  _state: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await requireRole(["director", "platform_admin"]);

  // Defaults to today; the SQL function decides whether today actually
  // starts a period for each child's cadence, so an off-cycle click is a
  // safe no-op.
  const on = str(formData, "on") ?? todayISO();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_recurring_charges", {
    p_tenant_id: session.profile.tenantId,
    p_on: on,
  });

  // The SQL wrapper `raise exception`s on an auth failure (wrong tenant or
  // non-director/platform_admin caller -- see
  // 20260814120100_billing_generation.sql), which supabase-js surfaces as
  // `error`, not a thrown JS exception. Ignoring both the error and the
  // returned count (the previous version of this action did) turned a real
  // failure into a silent no-op with no feedback to the director who clicked
  // the button.
  if (error) return { message: "Couldn't generate charges. Try again." };

  revalidatePath("/billing");
  revalidatePath("/billing/revenue");
  revalidatePath("/dashboard");

  const count = data ?? 0;
  return { message: count > 0 ? `Generated ${count} charge${count === 1 ? "" : "s"}.` : "Nothing to generate today." };
}
