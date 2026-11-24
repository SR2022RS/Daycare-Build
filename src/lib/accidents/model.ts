import type { AccidentStatus, AppRole, ParentNotifyMethod } from "@/types/database.types";

export const ACCIDENT_STATUS_LABELS: Record<AccidentStatus, string> = {
  open: "Open",
  reviewed: "Reviewed",
  closed: "Closed",
};

export const NOTIFY_METHOD_LABELS: Record<ParentNotifyMethod, string> = {
  phone: "Phone",
  in_person: "In person",
  message: "Message",
};

/**
 * Who may correct or close an accident report.
 *
 * A teacher files a report and can read it afterwards. Changing it, including
 * recording a later parent signature or closing it, is an admin action:
 * director, platform admin, or a site lead (campus-scoped again by RLS).
 */
export function canManageAccident(role: AppRole, isSiteLead: boolean): boolean {
  return role === "platform_admin" || role === "director" || isSiteLead;
}

export function clockTime(value: string): string {
  return value.slice(0, 5);
}
