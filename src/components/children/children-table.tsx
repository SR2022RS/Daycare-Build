"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { CHILD_STATUS_LABELS, FUNDING_TYPE_LABELS } from "@/lib/children/labels";
import type { ChildStatus, FundingType } from "@/types/database.types";

export interface ChildRow {
  id: string;
  name: string;
  dob: string;
  location: string;
  status: ChildStatus;
  fundingType: FundingType;
  weeklyRate: number | null;
  guardianCount: number;
}

function age(dob: string) {
  const diff = Date.now() - new Date(dob).getTime();
  const years = diff / (365.25 * 24 * 3600 * 1000);
  return years < 2 ? `${Math.round(years * 12)}mo` : `${Math.floor(years)}y`;
}

export function ChildrenTable({ rows, locations }: { rows: ChildRow[]; locations: string[] }) {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesLocation = location === "All" || r.location === location;
      const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.location.toLowerCase().includes(q);
      return matchesLocation && matchesSearch;
    });
  }, [rows, search, location]);

  const filters = ["All", ...locations];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 px-4.5 py-3.5">
        <input
          placeholder="Search children or location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-[34px] max-w-[300px] flex-1 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 outline-none focus:border-[var(--brand-accent)]"
        />
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setLocation(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              location === f
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

      <div className="hidden grid-cols-[2fr_0.8fr_1.2fr_1.3fr_1fr_1fr] gap-3 border-b border-gray-100 bg-gray-50 px-4.5 py-2.5 text-[10px] font-bold tracking-[.13em] text-gray-400 uppercase sm:grid">
        <span>Child</span>
        <span>Age</span>
        <span>Location</span>
        <span>Funding</span>
        <span>Weekly rate</span>
        <span className="text-right">Status</span>
      </div>

      {filtered.map((r) => (
        <Link
          key={r.id}
          href={`/children/${r.id}`}
          className="grid grid-cols-1 items-center gap-2 border-b border-gray-100 px-4.5 py-3 hover:bg-gray-50 sm:grid-cols-[2fr_0.8fr_1.2fr_1.3fr_1fr_1fr] sm:gap-3"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)]/10 text-[11px] font-bold text-[var(--brand-primary)]">
              {r.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-gray-900">{r.name}</div>
              <div className="truncate text-[11.5px] text-gray-400">
                {r.guardianCount} guardian{r.guardianCount === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <span className="text-[13px] text-gray-600 tabular-nums">{age(r.dob)}</span>
          <span className="text-[13px] text-gray-500">{r.location}</span>
          <span className="text-[13px] text-gray-600">{FUNDING_TYPE_LABELS[r.fundingType]}</span>
          <span className="text-[13px] text-gray-600 tabular-nums">
            {r.weeklyRate != null ? `$${r.weeklyRate.toFixed(2)}` : "—"}
          </span>
          <span className="text-left sm:text-right">
            <span
              className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                r.status === "active"
                  ? "bg-green-50 text-green-700"
                  : r.status === "waitlisted"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {CHILD_STATUS_LABELS[r.status]}
            </span>
          </span>
        </Link>
      ))}
      {filtered.length === 0 && (
        <div className="px-4.5 py-6 text-sm text-gray-500">No children match this search.</div>
      )}
    </div>
  );
}
