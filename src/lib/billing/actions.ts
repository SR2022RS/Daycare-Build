"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
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
  if (amount <= 0) {
    return { message: "Payment amount must be greater than zero." };
  }

  const supabase = await createClient();

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

  await supabase.rpc("recalc_invoice_totals", { p_invoice_id: invoiceId });

  revalidatePath("/billing");
  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing/revenue");
  revalidatePath("/dashboard");
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

  // Credits reduce what's owed, so they're stored negative regardless of how
  // the amount was typed in.
  const signed = type === "credit" ? -Math.abs(amount) : Math.abs(amount);

  const { data: payerRow } = await supabase
    .from("child_guardians")
    .select("guardian_id")
    .eq("child_id", childId)
    .eq("is_payer", true)
    .maybeSingle();

  if (!payerRow) return { message: "Set a paying guardian for this child first." };

  const today = new Date().toISOString().slice(0, 10);

  const { data: openInvoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("tenant_id", session.profile.tenantId)
    .eq("guardian_id", payerRow.guardian_id)
    .in("status", ["open", "partial"])
    .lte("period_start", today)
    .gte("period_end", today)
    .maybeSingle();

  let invoiceId = openInvoice?.id ?? null;

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

    if (invoiceError || !created) return { message: "Couldn't open an invoice for this family." };
    invoiceId = created.id;
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

  await supabase.rpc("recalc_invoice_totals", { p_invoice_id: invoiceId });

  revalidatePath("/billing");
  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing/revenue");
}

export async function voidCharge(formData: FormData) {
  await requireRole(["director", "platform_admin"]);

  const chargeId = str(formData, "chargeId");
  const invoiceId = str(formData, "invoiceId");
  if (!chargeId || !invoiceId) return;

  const supabase = await createClient();

  await supabase
    .from("charges")
    .update({ void: true, voided_at: new Date().toISOString() })
    .eq("id", chargeId);

  await supabase.rpc("recalc_invoice_totals", { p_invoice_id: invoiceId });

  revalidatePath("/billing");
  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing/revenue");
}

export async function generateNow(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);

  // Defaults to today; the SQL function decides whether today actually starts
  // a period for each child's cadence, so an off-cycle click is a safe no-op.
  const on = str(formData, "on") ?? new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  await supabase.rpc("generate_recurring_charges", {
    p_tenant_id: session.profile.tenantId,
    p_on: on,
  });

  revalidatePath("/billing");
  revalidatePath("/billing/revenue");
  revalidatePath("/dashboard");
}
