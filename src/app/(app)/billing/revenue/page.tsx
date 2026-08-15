import Link from "next/link";
import { Banknote, CircleDollarSign, HandCoins, Landmark } from "lucide-react";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getRevenueSummary } from "@/lib/billing/queries";
import { StatTile } from "@/components/ui/stat-tile";

export default async function RevenuePage() {
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const summary = await getRevenueSummary(supabase, session.profile.tenantId);

  return (
    <div className="max-w-[1240px]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-xl font-semibold text-gray-900">Revenue</h1>
          <p className="mt-1 text-[13px] text-gray-500">Across all open and closed invoices</p>
        </div>
        <Link
          href="/billing"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          All invoices
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Billed" value={`$${summary.billed.toFixed(2)}`} icon={CircleDollarSign} />
        <StatTile label="Collected" value={`$${summary.collected.toFixed(2)}`} icon={Banknote} />
        <StatTile
          label="Outstanding"
          value={`$${summary.outstanding.toFixed(2)}`}
          icon={HandCoins}
          tone={summary.outstanding > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Subsidy billed (not owed by families)"
          value={`$${summary.subsidyBilled.toFixed(2)}`}
          icon={Landmark}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4.5 py-3.5">
          <div>
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Overdue balances</h2>
            <div className="mt-0.5 text-[11.5px] text-gray-400">Past the invoice due date</div>
          </div>
          {summary.aging.length > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold tracking-[.12em] text-red-700 uppercase">
              {summary.aging.length}
            </span>
          )}
        </div>
        {summary.aging.map((row) => (
          <Link
            key={`${row.guardianId}-${row.daysOverdue}`}
            href={`/billing/guardians/${row.guardianId}`}
            className="flex items-center justify-between gap-3 border-b border-gray-100 px-4.5 py-3 hover:bg-gray-50"
          >
            <span className="truncate text-[13.5px] font-semibold text-gray-900">{row.guardianName}</span>
            <div className="shrink-0 text-right">
              <div className="text-[13px] font-semibold text-red-700 tabular-nums">
                ${row.amount.toFixed(2)}
              </div>
              <div className="text-[11px] text-gray-400">{row.daysOverdue} days overdue</div>
            </div>
          </Link>
        ))}
        {summary.aging.length === 0 && (
          <div className="px-4.5 py-6 text-center text-sm text-gray-500">Nothing overdue.</div>
        )}
      </div>
    </div>
  );
}
