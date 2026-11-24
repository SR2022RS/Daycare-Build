/**
 * AKPA dress code and the 1 / 2 / 3 count.
 *
 * Monday–Wednesday uniform, Thursday sweatsuit, Friday a $3 tag day.
 * The $3 is not stored here. Offenses in the count window go verbal, then
 * written, then a $10 fee due. The fee is a label, not a charge.
 *
 * Keep the window rules in step with public.uniform_window_start and
 * public.assign_uniform_step.
 */

export type UniformReset = "school_year" | "calendar_year" | "never";
export type UniformStep = "verbal" | "written" | "fee";

export const UNIFORM_FEE_CENTS = 1000;

export const DEFAULT_RESET: UniformReset = "school_year";
export const DEFAULT_SCHOOL_YEAR_MONTH = 9;
export const DEFAULT_SCHOOL_YEAR_DAY = 1;

export const STEP_LABELS: Record<UniformStep, string> = {
  verbal: "Verbal warning",
  written: "Written warning",
  fee: "Fee due",
};

export const RESET_LABELS: Record<UniformReset, string> = {
  school_year: "Each school year",
  calendar_year: "Each calendar year",
  never: "Never",
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** First date included in the count. Null means the count never resets. */
export function windowStart(
  mode: UniformReset,
  onDate: string,
  startMonth = DEFAULT_SCHOOL_YEAR_MONTH,
  startDay = DEFAULT_SCHOOL_YEAR_DAY,
): string | null {
  if (mode === "never") return null;
  const [year, month, day] = onDate.split("-").map(Number);
  if (mode === "calendar_year") return `${year}-01-01`;
  const started = month > startMonth || (month === startMonth && day >= startDay);
  const startYear = started ? year : year - 1;
  return `${startYear}-${pad(startMonth)}-${pad(startDay)}`;
}

export function inWindow(occurredOn: string, start: string | null): boolean {
  return start === null || occurredOn >= start;
}

/** Step for the next warning, given how many are already in the window. */
export function stepForCount(existingInWindow: number): UniformStep {
  if (existingInWindow <= 0) return "verbal";
  if (existingInWindow === 1) return "written";
  return "fee";
}

export function currentStepSummary(count: number): string {
  if (count <= 0) {
    return "No warnings in this count period. The next offense is a verbal warning.";
  }
  if (count === 1) {
    return "Step 1 of 3 — verbal warning. The next offense is a written warning.";
  }
  if (count === 2) {
    return "Step 2 of 3 — written warning. The next offense is a $10 fee.";
  }
  const fees = count - 2;
  return `Step 3 of 3 — fee due. ${fees} ${fees === 1 ? "fee" : "fees"} of $10 recorded in this period. Nothing is sent to billing.`;
}

export function dressForDate(isoDate: string): { title: string; detail: string } {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 4) {
    return { title: "Sweatsuit", detail: "Thursday is sweatsuit day." };
  }
  if (weekday === 5) {
    return {
      title: "Tag day — $3",
      detail: "Friday is a $3 tag day. Out of uniform is allowed when the $3 is paid. That $3 is not recorded here.",
    };
  }
  if (weekday === 0 || weekday === 6) {
    return { title: "Weekend", detail: "The uniform week is Monday through Friday." };
  }
  return { title: "Uniform", detail: "Monday through Wednesday is the AKPA uniform." };
}

/** Calendar date in New Jersey, where the campuses are. */
export function campusToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}
