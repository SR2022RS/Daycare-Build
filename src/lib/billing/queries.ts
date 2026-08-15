import type { SupabaseClient } from "@supabase/supabase-js";

import { todayISO } from "@/lib/billing/dates";
import type { Database, InvoiceStatus } from "@/types/database.types";

export interface InvoiceListRow {
  id: string;
  guardianName: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  total: number;
  paid: number;
  status: InvoiceStatus;
}

function toRow(row: {
  id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: InvoiceStatus;
  guardians: { full_name: string }[] | { full_name: string } | null;
}): InvoiceListRow {
  const guardian = Array.isArray(row.guardians) ? row.guardians[0] : row.guardians;
  return {
    id: row.id,
    guardianName: guardian?.full_name ?? "Unknown",
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueDate: row.due_date,
    total: row.total_amount,
    paid: row.amount_paid,
    status: row.status,
  };
}

export async function getInvoiceList(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<InvoiceListRow[]> {
  const { data } = await supabase
    .from("invoices")
    .select(
      "id, period_start, period_end, due_date, total_amount, amount_paid, status, guardians(full_name)",
    )
    .eq("tenant_id", tenantId)
    .order("period_start", { ascending: false });

  return (data ?? []).map(toRow);
}

export interface FamilyBalance {
  guardianName: string;
  invoices: InvoiceListRow[];
  outstanding: number;
}

export async function getFamilyBalance(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  guardianId: string,
): Promise<FamilyBalance> {
  const [{ data: guardian }, { data: invoiceRows }] = await Promise.all([
    supabase.from("guardians").select("full_name").eq("id", guardianId).maybeSingle(),
    supabase
      .from("invoices")
      .select(
        "id, period_start, period_end, due_date, total_amount, amount_paid, status, guardians(full_name)",
      )
      .eq("tenant_id", tenantId)
      .eq("guardian_id", guardianId)
      .order("period_start", { ascending: false }),
  ]);

  const invoices = (invoiceRows ?? []).map(toRow);
  // Clamp each invoice at 0 and sum only open/partial invoices, matching
  // getOutstandingTotal and getRevenueSummary so all three balance figures
  // agree with each other.
  const outstanding = invoices
    .filter((i) => i.status === "open" || i.status === "partial")
    .reduce((sum, i) => sum + Math.max(i.total - i.paid, 0), 0);

  return {
    guardianName: guardian?.full_name ?? "Unknown",
    invoices,
    outstanding: Math.round(outstanding * 100) / 100,
  };
}

export interface AgingRow {
  invoiceId: string;
  guardianId: string;
  guardianName: string;
  amount: number;
  daysOverdue: number;
}

export async function getRevenueSummary(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<{
  billed: number;
  collected: number;
  outstanding: number;
  subsidyBilled: number;
  aging: AgingRow[];
}> {
  const today = todayISO();

  const [{ data: invoiceRows }, { data: chargeRows }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, guardian_id, total_amount, amount_paid, status, due_date, guardians(full_name)")
      .eq("tenant_id", tenantId)
      .neq("status", "void"),
    supabase
      .from("charges")
      .select("subsidy_amount")
      .eq("tenant_id", tenantId)
      .eq("void", false),
  ]);

  const invoices = invoiceRows ?? [];
  const billed = invoices.reduce((sum, i) => sum + i.total_amount, 0);
  const collected = invoices.reduce((sum, i) => sum + i.amount_paid, 0);
  // Lifetime billed total across every non-void charge ever, including
  // charges on invoices that are already fully paid or void-adjacent -- not
  // an outstanding/pending figure. Named accordingly so it isn't mistaken
  // for "subsidy still owed."
  const subsidyBilled = (chargeRows ?? []).reduce((sum, c) => sum + c.subsidy_amount, 0);
  // Clamp each invoice at 0 and sum only open/partial invoices -- matches
  // getFamilyBalance/getOutstandingTotal so all three balance figures agree.
  // (billed - collected across all non-void invoices, the previous formula,
  // could go negative on an overpayment, since the DB only requires
  // amount > 0, not amount <= balance due.)
  const outstanding = invoices
    .filter((i) => i.status === "open" || i.status === "partial")
    .reduce((sum, i) => sum + Math.max(i.total_amount - i.amount_paid, 0), 0);

  const aging: AgingRow[] = invoices
    .filter((i) => (i.status === "open" || i.status === "partial") && i.due_date < today)
    .map((i) => {
      const guardian = Array.isArray(i.guardians) ? i.guardians[0] : i.guardians;
      const daysOverdue = Math.round(
        (new Date(today).getTime() - new Date(i.due_date).getTime()) / (24 * 60 * 60 * 1000),
      );
      return {
        invoiceId: i.id,
        guardianId: i.guardian_id,
        guardianName: guardian?.full_name ?? "Unknown",
        // Clamp at 0 -- matches getFamilyBalance/getOutstandingTotal so an
        // overpaid open invoice (amount_paid > total_amount, e.g. a partial
        // payment posted before a later void reduced the total) never
        // renders as a negative "overdue" amount.
        amount: Math.max(Math.round((i.total_amount - i.amount_paid) * 100) / 100, 0),
        daysOverdue,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    billed: Math.round(billed * 100) / 100,
    collected: Math.round(collected * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    subsidyBilled: Math.round(subsidyBilled * 100) / 100,
    aging,
  };
}

export async function getOutstandingTotal(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<{ total: number; overdueCount: number }> {
  const today = todayISO();

  const { data } = await supabase
    .from("invoices")
    .select("total_amount, amount_paid, due_date")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "partial"]);

  const rows = data ?? [];
  // Clamp at 0 -- matches getFamilyBalance/getRevenueSummary so all three
  // balance figures agree even in an overpayment edge case.
  const total = rows.reduce((sum, i) => sum + Math.max(i.total_amount - i.amount_paid, 0), 0);
  const overdueCount = rows.filter((i) => i.due_date < today).length;

  return { total: Math.round(total * 100) / 100, overdueCount };
}
