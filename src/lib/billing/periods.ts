import type { BillingCadence } from "@/types/database.types";

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utc(y: number, m0: number, day: number): Date {
  return new Date(Date.UTC(y, m0, day));
}

/** Monday = 1 in getUTCDay() terms (Sunday = 0). */
function isMonday(d: Date): boolean {
  return d.getUTCDay() === 1;
}

export function firstMondayOf(year: number, monthIndex0: number): Date {
  const first = utc(year, monthIndex0, 1);
  const shift = (8 - first.getUTCDay()) % 7;
  return utc(year, monthIndex0, 1 + shift);
}

export function thirdMondayOf(year: number, monthIndex0: number): Date {
  const first = firstMondayOf(year, monthIndex0);
  return new Date(first.getTime() + 14 * DAY_MS);
}

export function periodFor(
  cadence: BillingCadence,
  on: Date,
): { start: string; end: string } | null {
  const y = on.getUTCFullYear();
  const m = on.getUTCMonth();
  const day = on.getUTCDate();

  if (cadence === "monthly") {
    if (day !== 1) return null;
    return { start: iso(utc(y, m, 1)), end: iso(utc(y, m + 1, 0)) };
  }

  if (cadence === "weekly") {
    if (!isMonday(on)) return null;
    return { start: iso(on), end: iso(new Date(on.getTime() + 6 * DAY_MS)) };
  }

  // biweekly: the month's 1st and 3rd Mondays.
  if (!isMonday(on)) return null;
  const first = firstMondayOf(y, m);
  const third = thirdMondayOf(y, m);

  if (iso(on) === iso(first)) {
    return { start: iso(on), end: iso(new Date(third.getTime() - DAY_MS)) };
  }
  if (iso(on) === iso(third)) {
    const nextFirst = firstMondayOf(m === 11 ? y + 1 : y, (m + 1) % 12);
    return { start: iso(on), end: iso(new Date(nextFirst.getTime() - DAY_MS)) };
  }
  return null;
}

/**
 * The next date on/after `from` (inclusive) that `periodFor` recognizes as
 * a period start for the given cadence. Reuses `periodFor` as the single
 * source of truth for weekly/biweekly/monthly boundaries rather than
 * re-deriving them here -- it just scans forward day by day asking
 * `periodFor` "is this a period start?" until it says yes.
 *
 * Used to default an enroll-from-waitlist start date to a day the billing
 * generator will actually open a period for, instead of an arbitrary
 * mid-period day that would go unbilled until the following period.
 */
export function nextPeriodStart(cadence: BillingCadence, from: Date): string {
  let candidate = utc(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  // Monthly periods start once a month and biweekly at most ~28 days apart;
  // 45 days is a safe upper bound with margin, and each periodFor check is
  // O(1), so scanning forward day by day is cheap.
  for (let i = 0; i < 45; i++) {
    if (periodFor(cadence, candidate)) return iso(candidate);
    candidate = new Date(candidate.getTime() + DAY_MS);
  }
  return iso(candidate);
}

export function prorationFraction(
  periodStart: string,
  periodEnd: string,
  startDate: string,
): number {
  if (startDate <= periodStart) return 1;

  const start = new Date(`${periodStart}T00:00:00Z`).getTime();
  const end = new Date(`${periodEnd}T00:00:00Z`).getTime();
  const enrol = new Date(`${startDate}T00:00:00Z`).getTime();

  if (enrol > end) return 0;

  const totalDays = Math.round((end - start) / DAY_MS) + 1;
  const billedDays = Math.round((end - enrol) / DAY_MS) + 1;
  return Math.round((billedDays / totalDays) * 10000) / 10000;
}
