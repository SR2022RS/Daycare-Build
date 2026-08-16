import { CalendarClock } from "lucide-react";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/billing/dates";
import { getClearanceRollup, getExpiringCredentialsList } from "@/lib/staff/credentials";
import { getNextClosure } from "@/lib/calendar/next-closure";
import { getOpenShifts } from "@/lib/attendance/timecard";
import { getRevenueSummary } from "@/lib/billing/queries";
import { getWaitlist } from "@/lib/rooms/queries";
import { buildAttentionItems } from "@/lib/dashboard/attention";
import { AttentionList } from "@/components/dashboard/attention-list";
import { DashboardHeader, MetricBar, type Metric } from "@/components/dashboard/metric-bar";
import { ClearancePanel } from "@/components/dashboard/clearance-panel";
import {
  ExpiringPanel,
  OccupancyPanel,
  OnTheFloorPanel,
  OverduePanel,
} from "@/components/dashboard/side-panels";
import { StaffHome } from "@/app/(app)/dashboard/staff-home";

/**
 * Director dashboard.
 *
 * Ordered by what a director can act on: what is wrong, then the routine
 * numbers, then the detail behind them. Semantic colour appears in exactly one
 * place (the attention section) -- everything else stays neutral, which is
 * what lets a single red mark actually mean something.
 */

function longDate(iso: string) {
  // Parsed as UTC midnight to match todayISO(), which resolves in the center's
  // timezone. `new Date()` here would drift a day after ~7pm local.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function DashboardPage() {
  const session = await verifySession();
  const supabase = await createClient();

  if (session.profile.role === "staff") {
    return (
      <StaffHome
        staffId={session.profile.id}
        tenantId={session.profile.tenantId}
        today={todayISO()}
      />
    );
  }

  const tenantId = session.profile.tenantId;

  const [
    { count: staffCount },
    { data: progressRows },
    clearance,
    expiring,
    openShifts,
    revenue,
    waitlist,
    nextClosure,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase
      .from("staff_training_progress")
      .select("status, profiles!inner(tenant_id)")
      .eq("profiles.tenant_id", tenantId),
    getClearanceRollup(supabase, tenantId),
    getExpiringCredentialsList(supabase, tenantId, 60),
    getOpenShifts(supabase, tenantId),
    getRevenueSummary(supabase, tenantId),
    getWaitlist(supabase, tenantId),
    getNextClosure(supabase, tenantId),
  ]);

  const attention = buildAttentionItems({
    clearance: { total: clearance.total, clearedCount: clearance.clearedCount },
    expiring,
    aging: revenue.aging,
    openShifts,
  });

  // With no progress rows at all, completed/total is 0/0. Rendering that as
  // "0%" reads as "everyone failed" rather than "nobody has started yet".
  const totalProgress = progressRows?.length ?? 0;
  const completedProgress = progressRows?.filter((row) => row.status === "completed").length ?? 0;
  const training: Metric =
    totalProgress === 0
      ? { label: "Training", value: "—", meta: "not started" }
      : {
          label: "Training",
          value: `${Math.round((completedProgress / totalProgress) * 100)}%`,
          meta: "complete",
        };

  const metrics: Metric[] = [
    { label: "Staff", value: String(staffCount ?? 0) },
    {
      label: "On the floor",
      value: String(openShifts.length),
      meta: openShifts.length === 1 ? "clocked in" : undefined,
    },
    training,
    {
      label: "Collected",
      value: `$${revenue.collected.toFixed(2)}`,
      meta: revenue.billed > 0 ? `of $${revenue.billed.toFixed(2)}` : "nothing billed yet",
    },
  ];

  return (
    <div className="max-w-[1240px]">
      <DashboardHeader
        title={longDate(todayISO())}
        right={
          nextClosure ? (
            <span className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-600">
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]" />
              <span className="font-semibold text-gray-900">{nextClosure.name}</span>
              <span className="tabular-nums">
                {nextClosure.start_date}
                {nextClosure.end_date !== nextClosure.start_date ? ` – ${nextClosure.end_date}` : ""}
              </span>
            </span>
          ) : undefined
        }
      />

      <AttentionList items={attention} />

      <div className="mt-3.5">
        <MetricBar metrics={metrics} />
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <ClearancePanel rollup={clearance} />

        <div className="flex flex-col gap-4">
          <OnTheFloorPanel shifts={openShifts} />
          <ExpiringPanel entries={expiring} />
          <OverduePanel aging={revenue.aging} />
        </div>
      </div>

      <div className="mt-4">
        <OccupancyPanel groups={waitlist} />
      </div>
    </div>
  );
}
