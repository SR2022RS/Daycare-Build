import Link from "next/link";

import type { AttentionItem } from "@/lib/dashboard/attention";

/**
 * The only place on the dashboard that uses semantic colour.
 *
 * When nothing is wrong this collapses to a single quiet line rather than a
 * row of reassuring green cards -- an all-clear should take a second to read,
 * not occupy the top of the page.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4.5 py-3">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: "var(--signal-ok)" }}
        />
        <span className="text-[13.5px] text-gray-600">
          Nothing needs attention. Credentials, billing and timecards are all current.
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const color =
          item.severity === "critical" ? "var(--signal-critical)" : "var(--signal-warn)";

        return (
          <Link
            key={item.id}
            href={item.href}
            className="group flex flex-col justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
            // A 3px left rule carries severity without tinting the whole card,
            // which would make three items shout at once.
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="flex items-start gap-2.5">
              <span
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: color }}
              />
              <p className="text-[13.5px] leading-snug font-medium text-gray-900">{item.claim}</p>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[22px] font-semibold tabular-nums" style={{ color }}>
                {item.value}
              </span>
              <span className="text-[12px] font-semibold text-[var(--brand-primary)] group-hover:opacity-80">
                {item.cta} &rarr;
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
