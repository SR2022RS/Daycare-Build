import type { BillingCadence, ChildSchedule, ChildStatus, FundingType } from "@/types/database.types";

export const CHILD_STATUS_LABELS: Record<ChildStatus, string> = {
  active: "Active",
  waitlisted: "Waitlisted",
  inactive: "Inactive",
};

export const FUNDING_TYPE_LABELS: Record<FundingType, string> = {
  private: "Private pay",
  "4cs": "4Cs subsidy",
  mixed: "Mixed (private + 4Cs)",
};

export const SCHEDULE_LABELS: Record<ChildSchedule, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
};

export const CADENCE_LABELS: Record<BillingCadence, string> = {
  weekly: "Weekly (due Mondays)",
  biweekly: "Bi-weekly (1st & 3rd Mondays)",
  monthly: "Monthly (by the 5th)",
};

/** Renders a date of birth as an age like "18mo" or "4y". */
export function age(dob: string) {
  const diff = Date.now() - new Date(dob).getTime();
  const years = diff / (365.25 * 24 * 3600 * 1000);
  return years < 2 ? `${Math.round(years * 12)}mo` : `${Math.floor(years)}y`;
}
