import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getFamilyBalance } from "@/lib/billing/queries";
import { INVOICE_STATUS_LABELS, TONE_CLASSES, invoiceStatusTone } from "@/lib/billing/labels";
import { AddChargeForm } from "@/components/billing/add-charge-form";

export default async function FamilyBalancePage({
  params,
}: {
  params: Promise<{ guardianId: string }>;
}) {
  const { guardianId } = await params;
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const { data: guardianRow } = await supabase
    .from("guardians")
    .select("id")
    .eq("id", guardianId)
    .eq("tenant_id", session.profile.tenantId)
    .maybeSingle();

  if (!guardianRow) {
    notFound();
  }

  const [balance, { data: childRows }] = await Promise.all([
    getFamilyBalance(supabase, session.profile.tenantId, guardianId),
    supabase
      .from("child_guardians")
      .select("is_payer, children(id, full_name)")
      .eq("guardian_id", guardianId),
  ]);

  const children = (childRows ?? [])
    .map((row) => {
      const child = Array.isArray(row.children) ? row.children[0] : row.children;
      return child ? { id: child.id, name: child.full_name } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

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
          <h1 className="font-serif text-xl font-semibold text-gray-900">{balance.guardianName}</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {children.map((c) => c.name).join(", ") || "No children linked"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-gray-900 tabular-nums">
            ${balance.outstanding.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">outstanding</div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Invoice history</h2>
        </div>
        {balance.invoices.map((i) => (
          <Link
            key={i.id}
            href={`/billing/${i.id}`}
            className="flex items-center gap-3 border-b border-gray-100 px-4.5 py-3 hover:bg-gray-50"
          >
            <span className="flex-1 text-[13px] text-gray-500 tabular-nums">
              {i.periodStart} – {i.periodEnd}
            </span>
            <span className="text-[13px] text-gray-600 tabular-nums">${i.total.toFixed(2)}</span>
            <span
              className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                TONE_CLASSES[invoiceStatusTone(i.status, i.dueDate)]
              }`}
            >
              {INVOICE_STATUS_LABELS[i.status]}
            </span>
          </Link>
        ))}
        {balance.invoices.length === 0 && (
          <div className="px-4.5 py-6 text-center text-sm text-gray-500">No invoices yet.</div>
        )}

        <AddChargeForm kids={children} />
      </section>
    </div>
  );
}
