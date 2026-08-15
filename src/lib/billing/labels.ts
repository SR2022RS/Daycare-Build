import { todayISO } from "@/lib/billing/dates";
import type { ChargeType, InvoiceStatus, PaymentMethod } from "@/types/database.types";

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  tuition: "Tuition",
  fee: "Fee",
  credit: "Credit",
  adjustment: "Adjustment",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: "Open",
  partial: "Partially paid",
  paid: "Paid",
  void: "Void",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  zelle: "Zelle",
  venmo: "Venmo",
  other: "Other",
  stripe: "Card / bank (Stripe)",
};

export function invoiceStatusTone(
  status: InvoiceStatus,
  dueDate: string,
): "green" | "amber" | "red" | "gray" {
  if (status === "paid") return "green";
  if (status === "void") return "gray";
  const overdue = dueDate < todayISO();
  if (overdue) return "red";
  return "amber";
}

export const TONE_CLASSES: Record<"green" | "amber" | "red" | "gray", string> = {
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-gray-100 text-gray-600",
};
