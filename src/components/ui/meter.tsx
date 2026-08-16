/**
 * Horizontal progress bar — the only data-viz idiom this codebase has, lifted
 * from `src/components/training/training-module-list.tsx` so the dashboard
 * reuses it rather than inventing a second visual language.
 *
 * There is no charting library here on purpose; a div with a width is honest,
 * accessible and weighs nothing.
 */

export type MeterTone = "accent" | "critical" | "warn" | "ok" | "muted";

const FILL: Record<MeterTone, string> = {
  accent: "var(--brand-accent)",
  critical: "var(--signal-critical)",
  warn: "var(--signal-warn)",
  ok: "var(--signal-ok)",
  muted: "var(--signal-muted)",
};

export function Meter({
  pct,
  tone = "accent",
  className = "",
  label,
}: {
  /** Clamped to 0-100 by the component; callers needn't pre-clamp. */
  pct: number;
  tone?: MeterTone;
  className?: string;
  /** Screen-reader description. Without it the bar is decorative. */
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));

  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-gray-100 ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${clamped}%`, background: FILL[tone] }}
      />
    </div>
  );
}

/**
 * Two-segment bar for a cleared/outstanding split, so the remainder reads as
 * a real quantity rather than empty track.
 */
export function SplitMeter({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label?: string;
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <div
      className="flex h-2 overflow-hidden rounded-full bg-gray-100"
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <div style={{ width: `${pct}%`, background: "var(--signal-ok)" }} />
      <div style={{ width: `${100 - pct}%`, background: "var(--signal-critical)", opacity: 0.75 }} />
    </div>
  );
}
