"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  center: string;
  completed: number;
  total: number;
  credsCleared: number;
  credsTotal: number;
  cleared: boolean | null; // null = not applicable (director)
}

export function StaffDirectoryTable({ rows, centers }: { rows: StaffRow[]; centers: string[] }) {
  const [search, setSearch] = useState("");
  const [center, setCenter] = useState("All");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesCenter = center === "All" || r.center === center || r.center === "All centers";
      const matchesSearch =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        r.center.toLowerCase().includes(q);
      return matchesCenter && matchesSearch;
    });
  }, [rows, search, center]);

  const filters = ["All", ...centers];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 px-4.5 py-3.5">
        <input
          placeholder="Search staff, role, or center"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-[34px] max-w-[300px] flex-1 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 outline-none focus:border-[var(--brand-accent)]"
        />
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setCenter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              center === f
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

      <div className="hidden grid-cols-[2fr_1.3fr_1.1fr_1fr_1fr_90px] gap-3 border-b border-gray-100 bg-gray-50 px-4.5 py-2.5 text-[10px] font-bold tracking-[.13em] text-gray-400 uppercase sm:grid">
        <span>Staff member</span>
        <span>Role</span>
        <span>Center</span>
        <span>Coursework</span>
        <span>Credentials</span>
        <span className="text-right">Status</span>
      </div>

      {filtered.map((r) => {
        const pct = r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0;
        return (
          <Link
            key={r.id}
            href={`/staff/${r.id}`}
            className="grid grid-cols-1 items-center gap-2 border-b border-gray-100 px-4.5 py-3 hover:bg-gray-50 sm:grid-cols-[2fr_1.3fr_1.1fr_1fr_1fr_90px] sm:gap-3"
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
                <div className="truncate text-[11.5px] text-gray-400">{r.email}</div>
              </div>
            </div>
            <span className="text-[13px] text-gray-600 capitalize">{r.role}</span>
            <span className="text-[13px] text-gray-500">{r.center}</span>
            <div>
              <div className="h-[5px] max-w-[90px] overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: pct === 100 ? "#15803D" : "var(--brand-accent)",
                  }}
                />
              </div>
              <div className="mt-1 text-[11px] text-gray-400 tabular-nums">
                {r.completed}/{r.total}
              </div>
            </div>
            <span
              className={`text-[12.5px] font-medium ${
                r.credsCleared === r.credsTotal ? "text-gray-700" : "text-red-700"
              }`}
            >
              {r.credsCleared} of {r.credsTotal}
            </span>
            <span className="text-left sm:text-right">
              {r.cleared === null ? (
                <span className="text-xs text-gray-400">&mdash;</span>
              ) : (
                <span
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                    r.cleared ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {r.cleared ? "Cleared" : "Not cleared"}
                </span>
              )}
            </span>
          </Link>
        );
      })}
      {filtered.length === 0 && (
        <div className="px-4.5 py-6 text-sm text-gray-500">No staff match this search.</div>
      )}
    </div>
  );
}
