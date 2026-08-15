import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { voidCharge } from "@/lib/billing/actions";
import {
  CHARGE_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  TONE_CLASSES,
  invoiceStatusTone,
} from "@/lib/billing/labels";
import { RecordPaymentForm } from "@/components/billing/record-payment-form";
import type { PaymentMethod } from "@/types/database.types";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, guardian_id, period_start, period_end, due_date, status, total_amount, amount_paid, guardians(full_name)",
    )
    .eq("id", invoiceId)
    .eq("tenant_id", session.profile.tenantId)
    .maybeSingle();

  if (!invoice) {
    notFound();
  }

  const guardian = Array.isArray(invoice.guardians) ? invoice.guardians[0] : invoice.guardians;

  const [{ data: chargeRows }, { data: paymentRows }] = await Promise.all([
    supabase
      .from("charges")
      .select("id, type, description, subsidy_amount, parent_amount, void, children(full_name)")
      .eq("invoice_id", invoiceId)
      .order("created_at"),
    supabase
      .from("payments")
      .select("id, amount, method, paid_at, note")
      .eq("invoice_id", invoiceId)
      .order("paid_at", { ascending: false }),
  ]);

  const charges = (chargeRows ?? []).map((c) => {
    const child = Array.isArray(c.children) ? c.children[0] : c.children;
    return { ...c, childName: child?.full_name ?? "Unknown" };
  });

  const balance = invoice.total_amount - invoice.amount_paid;
  // Spec §91/§141: an overpayment should become a credit-type charge on the
  // guardian's next invoice -- that automatic credit path is deferred to the
  // Stripe phase (spec's own future-work section). Until then, clamp the
  // displayed balance at 0 (matching every other balance figure in the app,
  // per queries.ts) and surface the excess explicitly so a director notices
  // and can act on it manually via "Add charge" (credit).
  const overpaid = invoice.amount_paid > invoice.total_amount;
  const overpaidAmount = overpaid ? invoice.amount_paid - invoice.total_amount : 0;

  return (
    <div className="max-w-[1000px]">
      <Link
        href="/billing"
        className="mb-3.5 inline-block text-[12.5px] font-semibold text-gray-500 hover:text-[var(--brand-primary)]"
      >
        &larr; Invoices
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-xl font-semibold text-gray-900">{guardian?.full_name}</h1>
          <p className="mt-1 text-[13px] text-gray-500 tabular-nums">
            {invoice.period_start} – {invoice.period_end} &middot; due {invoice.due_date}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-gray-900 tabular-nums">
            ${Math.max(balance, 0).toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">outstanding</div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
            TONE_CLASSES[invoiceStatusTone(invoice.status, invoice.due_date)]
          }`}
        >
          {INVOICE_STATUS_LABELS[invoice.status]}
        </span>
      </div>

      {overpaid && (
        <div className={`mb-4 rounded-xl px-4.5 py-3 text-[13px] font-medium ${TONE_CLASSES.amber}`}>
          Overpaid by ${overpaidAmount.toFixed(2)} — add a credit to carry this forward.
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Line items</h2>
            <div className="mt-0.5 text-[11.5px] text-gray-400">
              Subsidy amounts are tracked for reimbursement, not billed to the family
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-gray-900">
                    {c.childName}
                    {c.void && <span className="ml-2 text-[11px] font-medium text-gray-400">voided</span>}
                  </div>
                  <div className="truncate text-[11.5px] text-gray-400">
                    {CHARGE_TYPE_LABELS[c.type]} &middot; {c.description}
                    {c.subsidy_amount > 0 && ` · $${c.subsidy_amount.toFixed(2)} subsidy`}
                  </div>
                </div>
                <span
                  className={`text-[13px] tabular-nums ${c.void ? "text-gray-400 line-through" : "text-gray-700"}`}
                >
                  ${c.parent_amount.toFixed(2)}
                </span>
                {!c.void && (
                  <form action={voidCharge}>
                    <input type="hidden" name="chargeId" value={c.id} />
                    <button
                      type="submit"
                      className="text-[11px] font-medium text-gray-400 hover:text-red-600"
                    >
                      Void
                    </button>
                  </form>
                )}
              </li>
            ))}
            {charges.length === 0 && (
              <li className="px-4.5 py-6 text-center text-sm text-gray-500">No line items yet.</li>
            )}
          </ul>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Payments</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {(paymentRows ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4.5 py-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-gray-900 tabular-nums">
                    ${p.amount.toFixed(2)}
                  </div>
                  <div className="truncate text-[11.5px] text-gray-400">
                    {PAYMENT_METHOD_LABELS[p.method as PaymentMethod]} &middot; {p.paid_at}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
              </li>
            ))}
            {(paymentRows ?? []).length === 0 && (
              <li className="px-4.5 py-6 text-center text-sm text-gray-500">Nothing recorded yet.</li>
            )}
          </ul>

          <RecordPaymentForm invoiceId={invoice.id} balance={balance} />
        </section>
      </div>
    </div>
  );
}
