import type { ReactNode } from "react";

/**
 * Routine numbers, deliberately uncoloured.
 *
 * This replaces six equally-weighted stat tiles, half of which turned red.
 * Nothing here ever signals severity -- that is the job of the attention
 * section above it. Keeping these neutral is what lets a single red mark
 * elsewhere on the page actually mean something.
 */

export interface Metric {
  label: string;
  value: string;
  /** Optional qualifier: "of 29", "this period". */
  meta?: string;
}

// Tailwind only ships classes it can see in the source, so the column count
// is a lookup rather than a template literal. Four was the original fixed
// layout; five arrived with "Children here". Anything outside this range
// falls back to four and wraps, which is ugly but never blank.
const COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
};

export function MetricBar({ metrics }: { metrics: Metric[] }) {
  const columns = COLUMNS[metrics.length] ?? "sm:grid-cols-4";

  return (
    <div
      className={`grid grid-cols-2 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white sm:divide-y-0 ${columns}`}
    >
      {metrics.map((metric, i) => (
        <div
          key={metric.label}
          className={`px-4.5 py-3.5 ${i > 0 ? "sm:border-l sm:border-gray-100" : ""} ${
            i % 2 === 1 ? "border-l border-gray-100 sm:border-l" : ""
          }`}
        >
          <div className="text-[10px] font-bold tracking-[.13em] text-gray-400 uppercase">
            {metric.label}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[22px] leading-none font-semibold text-gray-900 tabular-nums">
              {metric.value}
            </span>
            {metric.meta && <span className="text-[12px] text-gray-400">{metric.meta}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Wrapper so a page can put the date and closure on one line. */
export function DashboardHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h1 className="font-serif text-xl font-semibold text-gray-900">{title}</h1>
      {right}
    </div>
  );
}
