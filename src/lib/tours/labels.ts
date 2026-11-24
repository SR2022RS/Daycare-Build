import type { TourStatus } from "@/types/database.types";

export const HEARD_ABOUT = [
  "Google",
  "Facebook",
  "Instagram",
  "Friend or family",
  "Drove by",
  "Other",
] as const;

export const TOUR_STATUSES: TourStatus[] = [
  "new",
  "contacted",
  "toured",
  "enrolled",
  "not_interested",
];

export const TOUR_STATUS_LABELS: Record<TourStatus, string> = {
  new: "New",
  contacted: "Contacted",
  toured: "Toured",
  enrolled: "Enrolled",
  not_interested: "Not interested",
};

export function isHeardAbout(value: string): value is (typeof HEARD_ABOUT)[number] {
  return (HEARD_ABOUT as readonly string[]).includes(value);
}
