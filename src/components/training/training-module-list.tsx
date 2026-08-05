"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface ModuleEntry {
  id: string;
  title: string;
  category: string;
  required: boolean;
  pct: number;
  statusLabel: string;
  statusTone: "done" | "progress" | "todo";
  meta: string;
}

const REQUIRED_CATEGORIES = ["Compliance", "Emergency Preparedness", "Policy Sign-offs"];
const PROPOSED_GATING_CATEGORY = "Policy Sign-offs";

const TONE_COLOR: Record<ModuleEntry["statusTone"], { dot: string; bar: string; text: string; bg: string }> = {
  done: { dot: "#15803D", bar: "#15803D", text: "#15803D", bg: "#ECFDF3" },
  progress: { dot: "var(--brand-accent)", bar: "var(--brand-accent)", text: "#B4530A", bg: "#FFF3E4" },
  todo: { dot: "#CBD5E1", bar: "var(--brand-accent)", text: "#64748B", bg: "#F1F5F9" },
};

export function TrainingModuleList({
  modules,
  isDirector,
  headline,
}: {
  modules: ModuleEntry[];
  isDirector: boolean;
  headline: { label: string; value: string; meta: string; pct: number };
}) {
  const [filter, setFilter] = useState<"all" | "incomplete" | "required">("all");

  const filtered = useMemo(() => {
    return modules.filter((m) => {
      if (filter === "required") return REQUIRED_CATEGORIES.includes(m.category);
      if (filter === "incomplete") return m.pct < (isDirector ? 80 : 100);
      return true;
    });
  }, [modules, filter, isDirector]);

  const categories = Array.from(new Set(filtered.map((m) => m.category)));

  const filters: { id: typeof filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "incomplete", label: isDirector ? "Below 80%" : "Incomplete" },
    { id: "required", label: "State required" },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="min-w-[220px] flex-1">
          <div className="text-[10px] font-bold tracking-[.16em] text-gray-400 uppercase">
            {headline.label}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-[28px] font-semibold text-gray-900 tabular-nums">{headline.value}</span>
            <span className="text-[13px] text-gray-500">{headline.meta}</span>
          </div>
          <div className="mt-3 h-1.5 max-w-[520px] overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${headline.pct}%`, background: "var(--brand-accent)" }}
            />
          </div>
        </div>
        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.id
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {categories.map((category) => {
        const items = filtered.filter((m) => m.category === category);
        const avgPct = Math.round(items.reduce((sum, m) => sum + m.pct, 0) / items.length);
        return (
          <div key={category} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50 px-4.5 py-3">
              <h3 className="font-serif text-[14px] font-semibold tracking-[.04em] text-gray-900">
                {category}
              </h3>
              <span className="text-[11.5px] text-gray-400">
                {items.length} module{items.length === 1 ? "" : "s"}
              </span>
              {category === PROPOSED_GATING_CATEGORY && (
                <span className="rounded-full border border-dashed border-[var(--brand-accent)] px-2.5 py-0.5 text-[9.5px] font-bold tracking-[.13em] text-amber-800 uppercase">
                  Proposed gating &middot; not yet built
                </span>
              )}
              <span
                className="ml-auto text-xs font-semibold tabular-nums"
                style={{ color: avgPct >= 90 ? "#15803D" : avgPct >= 70 ? "#B4530A" : "#B42318" }}
              >
                {avgPct}%
              </span>
            </div>
            {items.map((m) => {
              const colors = TONE_COLOR[m.statusTone];
              return (
                <Link
                  key={m.id}
                  href={`/training/${m.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-gray-100 px-4.5 py-3 last:border-b-0 hover:bg-gray-50 sm:grid-cols-[2.2fr_1fr_118px]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-sm"
                      style={{ background: colors.dot }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium text-gray-900">{m.title}</div>
                      <div className="truncate text-[11.5px] text-gray-400">{m.meta}</div>
                    </div>
                  </div>
                  <div className="hidden h-[5px] overflow-hidden rounded-full bg-gray-100 sm:block">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${m.pct}%`, background: colors.bar }}
                    />
                  </div>
                  <span
                    className="justify-self-end rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] whitespace-nowrap uppercase"
                    style={{ color: colors.text, background: colors.bg }}
                  >
                    {m.statusLabel}
                  </span>
                </Link>
              );
            })}
          </div>
        );
      })}
      {categories.length === 0 && (
        <p className="rounded-xl border border-gray-200 bg-white px-4.5 py-6 text-sm text-gray-500">
          Nothing matches this filter.
        </p>
      )}
    </div>
  );
}
