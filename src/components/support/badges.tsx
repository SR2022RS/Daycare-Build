import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/support/definitions";
import type { SupportTicketPriority, SupportTicketStatus } from "@/types/database.types";

const STATUS_TONE: Record<SupportTicketStatus, string> = {
  open: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  resolved: "bg-green-50 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};

const PRIORITY_TONE: Record<SupportTicketPriority, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-indigo-50 text-indigo-700",
  urgent: "bg-red-50 text-red-700",
};

const pillClass = "rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase";

export function StatusPill({ status }: { status: SupportTicketStatus }) {
  return <span className={`${pillClass} ${STATUS_TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityPill({ priority }: { priority: SupportTicketPriority }) {
  return <span className={`${pillClass} ${PRIORITY_TONE[priority]}`}>{PRIORITY_LABELS[priority]}</span>;
}
