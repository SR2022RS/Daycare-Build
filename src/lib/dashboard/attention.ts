/**
 * Decides what a director needs to deal with today.
 *
 * Pure and I/O-free so the rules can be unit-tested. The old dashboard gave
 * six tiles equal weight and coloured half of them, which meant nothing stood
 * out; the point of this module is that something appears here ONLY when it is
 * genuinely wrong, so an empty list is meaningful information.
 */

export type AttentionSeverity = "critical" | "warn";

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  /** One sentence, plain language, no jargon. */
  claim: string;
  /** The single number that matters, pre-formatted. */
  value: string;
  href: string;
  cta: string;
}

export interface AttentionInput {
  clearance: { total: number; clearedCount: number };
  expiring: { daysUntil: number }[];
  aging: { daysOverdue: number; amount: number }[];
  openShifts: { needsCorrection: boolean }[];
  /**
   * Child visits still open after 12 hours. Already filtered by the caller
   * (`getPresentChildren` applies `isStaleVisit`), unlike `openShifts`, which
   * carries its own flag -- the staleness rule for children lives in
   * `child-visits.ts` beside the visit model it describes.
   */
  staleVisits: { childId: string }[];
}

const CRITICAL_EXPIRY_DAYS = 30;

/** Highest severity first, then by how much is at stake. */
const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warn: 1 };

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  // Solo-supervision clearance. A centre running under-cleared is a licensing
  // exposure, not a to-do, so it outranks everything else here.
  const notCleared = input.clearance.total - input.clearance.clearedCount;
  if (notCleared > 0) {
    items.push({
      id: "clearance",
      severity: "critical",
      claim:
        notCleared === 1
          ? "1 staff member isn't cleared for solo supervision"
          : `${notCleared} staff aren't cleared for solo supervision`,
      value: String(notCleared),
      href: "/staff",
      cta: "Review staff",
    });
  }

  // Expiring credentials: inside 30 days is critical, 31-60 is a heads-up.
  const soonest = input.expiring.reduce<number | null>(
    (min, e) => (min === null || e.daysUntil < min ? e.daysUntil : min),
    null,
  );
  if (soonest !== null) {
    const critical = soonest <= CRITICAL_EXPIRY_DAYS;
    const count = input.expiring.length;
    items.push({
      id: "expiring",
      severity: critical ? "critical" : "warn",
      claim:
        count === 1
          ? `A credential expires in ${soonest} ${soonest === 1 ? "day" : "days"}`
          : `${count} credentials expire soon, the first in ${soonest} ${soonest === 1 ? "day" : "days"}`,
      value: String(count),
      href: "/staff",
      cta: "See credentials",
    });
  }

  // A child still checked in from yesterday. Deliberately placed above the
  // money branch: both are `warn`, the sort below is stable, and only three
  // items survive the slice -- so insertion order is what decides which
  // warning gets dropped. An attendance record that says a child is in the
  // building when they went home is the artifact a licensing visit reads;
  // overdue tuition is a phone call.
  if (input.staleVisits.length > 0) {
    const count = input.staleVisits.length;
    items.push({
      id: "staleVisits",
      severity: "warn",
      claim:
        count === 1
          ? "A child is still checked in from earlier"
          : `${count} children are still checked in from earlier`,
      value: String(count),
      href: "/attendance/children",
      cta: "Open the board",
    });
  }

  // Money owed. Warn rather than critical: overdue tuition is a conversation,
  // not a compliance failure.
  if (input.aging.length > 0) {
    const worst = input.aging.reduce((a, b) => (b.daysOverdue > a.daysOverdue ? b : a));
    const total = input.aging.reduce((sum, a) => sum + a.amount, 0);
    items.push({
      id: "overdue",
      severity: "warn",
      claim:
        input.aging.length === 1
          ? `1 family is overdue, by ${worst.daysOverdue} ${worst.daysOverdue === 1 ? "day" : "days"}`
          : `${input.aging.length} families are overdue, the oldest by ${worst.daysOverdue} days`,
      value: `$${(Math.round(total * 100) / 100).toFixed(2)}`,
      href: "/billing",
      cta: "Open billing",
    });
  }

  // A shift left open overnight is usually a forgotten clock-out, which
  // quietly corrupts the timecard it lands on.
  const stale = input.openShifts.filter((s) => s.needsCorrection).length;
  if (stale > 0) {
    items.push({
      id: "shifts",
      severity: "warn",
      claim:
        stale === 1
          ? "A shift is still open and needs correcting"
          : `${stale} shifts are still open and need correcting`,
      value: String(stale),
      href: "/attendance",
      cta: "Fix timecards",
    });
  }

  // Three is the most a person will actually read. Anything dropped is still
  // reachable from its own page, and the counts stay visible in the metric bar.
  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, 3);
}
