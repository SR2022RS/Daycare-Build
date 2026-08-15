import type { Metadata } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { INTENSIVE } from "@/lib/intensive/config";
import { listRegistrations, summarize } from "@/lib/intensive/queries";
import { RegistrationsTable } from "@/components/intensive/registrations-table";

export const metadata: Metadata = {
  title: `Registrations — ${INTENSIVE.name}`,
  robots: { index: false, follow: false },
};

export default async function IntensiveRegistrationsPage() {
  // This route sits under /intensive, which is otherwise public. The guard
  // that matters is right here -- proxy.ts also carves it back out of the
  // public list, but a page must never rely on the proxy alone.
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const rows = await listRegistrations(supabase, session.profile.tenantId);
  const stats = summarize(rows);

  const revenue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(stats.revenueCents / 100);

  const tiles = [
    {
      label: "Registered",
      value: String(stats.paidCount),
      meta: "Paid and confirmed",
      dot: "#3E8E41",
    },
    {
      label: "Revenue collected",
      value: revenue,
      meta:
        stats.refundedCount === 0
          ? "No refunds"
          : `Net of ${stats.refundedCount} refund${stats.refundedCount === 1 ? "" : "s"}`,
      dot: "#E30C7B",
    },
    {
      label: "Seats",
      value: INTENSIVE.capacity === null ? "No cap" : String(INTENSIVE.capacity),
      meta: INTENSIVE.capacity === null ? "Capacity is not limited" : "Configured capacity",
      dot: "#64748B",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <header className="flex flex-wrap items-center justify-between gap-3.5 border-b border-[#E6E9EE] bg-white px-6 py-4">
        <div>
          <h1 className="font-serif text-xl font-semibold text-[#0F172A]">
            Intensive Registrations
          </h1>
          <p className="mt-[3px] text-[12.5px] text-[#64748B]">
            {INTENSIVE.dateLabel} · updates when a payment clears
          </p>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 rounded-lg border border-[#E2E6EC] bg-white px-4 py-2 text-[13px] font-semibold text-[#475569] hover:border-brand-primary hover:text-brand-primary"
        >
          Back to dashboard
        </Link>
      </header>

      <div className="px-6 pt-[22px] pb-[60px]">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-xl border border-[#E6E9EE] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.05)]"
            >
              <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#64748B]">
                <span
                  aria-hidden="true"
                  className="size-[5px] rounded-full"
                  style={{ background: tile.dot }}
                />
                {tile.label}
              </dt>
              <dd className="mt-2 text-[30px] font-semibold tracking-[-.02em] tabular-nums text-[#0F172A]">
                {tile.value}
              </dd>
              <dd className="mt-1 text-[11.5px] text-[#64748B]">{tile.meta}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4">
          <RegistrationsTable rows={rows} />
        </div>
      </div>
    </div>
  );
}
