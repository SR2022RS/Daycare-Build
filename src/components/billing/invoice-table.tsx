"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { INVOICE_STATUS_LABELS, TONE_CLASSES, invoiceStatusTone } from "@/lib/billing/labels";
import type { InvoiceListRow } from "@/lib/billing/queries";

const FILTERS = ["All", "Open", "Partially paid", "Paid", "Void"] as const;

export function InvoiceTable({ rows }: { rows: InvoiceListRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesFilter = filter === "All" || INVOICE_STATUS_LABELS[r.status] === filter;
      const matchesSearch = !q || r.guardianName.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [rows, search, filter]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 px-4.5 py-3.5">
        <input
          placeholder="Search families"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-[34px] max-w-[300px] flex-1 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 outline-none focus:border-[var(--brand-accent)]"
        />
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          Showing {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="hidden grid-cols-[1.6fr_1.4fr_1fr_1fr_1fr_1fr] gap-3 border-b border-gray-100 bg-gray-50 px-4.5 py-2.5 text-[10px] font-bold tracking-[.13em] text-gray-400 uppercase sm:grid">
        <span>Family</span>
        <span>Period</span>
        <span>Due</span>
        <span>Total</span>
        <span>Paid</span>
        <span className="text-right">Status</span>
      </div>

      {filtered.map((r) => (
        <Link
          key={r.id}
          href={`/billing/${r.id}`}
          className="grid grid-cols-1 items-center gap-2 border-b border-gray-100 px-4.5 py-3 hover:bg-gray-50 sm:grid-cols-[1.6fr_1.4fr_1fr_1fr_1fr_1fr] sm:gap-3"
        >
          <span className="truncate text-[13.5px] font-semibold text-gray-900">{r.guardianName}</span>
          <span className="text-[13px] text-gray-500 tabular-nums">
            {r.periodStart} – {r.periodEnd}
          </span>
          <span className="text-[13px] text-gray-500 tabular-nums">{r.dueDate}</span>
          <span className="text-[13px] text-gray-600 tabular-nums">${r.total.toFixed(2)}</span>
          <span className="text-[13px] text-gray-600 tabular-nums">${r.paid.toFixed(2)}</span>
          <span className="text-left sm:text-right">
            <span
              className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                TONE_CLASSES[invoiceStatusTone(r.status, r.dueDate)]
              }`}
            >
              {INVOICE_STATUS_LABELS[r.status]}
            </span>
          </span>
        </Link>
      ))}
      {filtered.length === 0 && (
        <div className="px-4.5 py-6 text-center text-sm text-gray-500">No invoices match this search.</div>
      )}
    </div>
  );
}
