import type { ReactNode } from "react";

/**
 * The uppercase status pill used across the portal. The class string matches
 * `src/components/support/badges.tsx`, which stays as-is -- it maps ticket
 * enums to tones and is the right home for that; this is the generic version
 * for everything else.
 *
 * `critical` and `warn` are for compliance and money only. Routine counts use
 * `neutral`, so that colour keeps its meaning.
 */
export type PillTone = "neutral" | "ok" | "warn" | "critical" | "info";

const TONE: Record<PillTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  ok: "bg-green-50 text-green-700",
  warn: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
};

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
