import * as z from "zod";

import type { SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from "@/types/database.types";

export const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  question: "Question",
  bug: "Bug",
  feature_request: "Feature Request",
  account_access: "Account/Access",
  other: "Other",
};

export const PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as SupportTicketCategory[];
export const ALL_PRIORITIES = Object.keys(PRIORITY_LABELS) as SupportTicketPriority[];
export const ALL_STATUSES = Object.keys(STATUS_LABELS) as SupportTicketStatus[];

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export const NewTicketSchema = z.object({
  category: z.enum(["question", "bug", "feature_request", "account_access", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  subject: z.string().trim().min(3, { error: "Give it a short subject." }).max(200),
  description: z.string().trim().min(10, { error: "Describe what happened in a bit more detail." }).max(5000),
});

export type TicketFormState =
  | {
      errors?: { subject?: string[]; description?: string[]; category?: string[]; priority?: string[] };
      message?: string;
    }
  | undefined;
