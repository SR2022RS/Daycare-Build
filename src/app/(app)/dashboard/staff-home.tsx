import Link from "next/link";
import { BookOpen, ClockAlert, FileText, Megaphone } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { CREDENTIAL_LABELS } from "@/lib/staff/credentials";
import { clockIn, clockOut } from "@/lib/attendance/actions";
import { formatMinutes, getMonday, getTimecard } from "@/lib/attendance/timecard";
import { LiveClock } from "@/components/attendance/live-clock";
import type { CredentialType } from "@/types/database.types";

// T1 -- staff home ("My day"): clock status, hours so far, what's due across
// training/policies/credentials, all pulled from tables that already exist.
export async function StaffHome({
  staffId,
  tenantId,
  today,
}: {
  staffId: string;
  tenantId: string;
  today: string;
}) {
  const supabase = await createClient();
  const weekStart = getMonday(new Date());
  const withinDays = 60;
  const now = new Date();
  const future = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { data: myAttendance },
    card,
    { data: modules },
    { data: progressRows },
    { data: policies },
    { data: acks },
    { data: expiringCreds },
  ] = await Promise.all([
    supabase
      .from("attendance")
      .select("clock_in_at, clock_out_at")
      .eq("staff_id", staffId)
      .eq("date", today)
      .maybeSingle(),
    getTimecard(supabase, staffId, weekStart),
    supabase
      .from("training_modules")
      .select("id, title, category")
      .eq("tenant_id", tenantId)
      .eq("required", true),
    supabase.from("staff_training_progress").select("module_id, status").eq("staff_id", staffId),
    supabase.from("policies").select("id, title, category").eq("tenant_id", tenantId),
    supabase.from("policy_acknowledgments").select("policy_id").eq("staff_id", staffId),
    supabase
      .from("staff_credentials")
      .select("credential_type, expires_at")
      .eq("staff_id", staffId)
      .not("expires_at", "is", null)
      .gte("expires_at", today)
      .lte("expires_at", future)
      .order("expires_at"),
  ]);

  const clockedIn = Boolean(myAttendance?.clock_in_at) && !myAttendance?.clock_out_at;
  const statusText = myAttendance?.clock_in_at
    ? `Clocked in at ${new Date(myAttendance.clock_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : "Not clocked in today";

  const completedModuleIds = new Set(
    (progressRows ?? []).filter((r) => r.status === "completed").map((r) => r.module_id),
  );
  const trainingDue = (modules ?? []).filter((m) => !completedModuleIds.has(m.id));

  const ackedPolicyIds = new Set((acks ?? []).map((a) => a.policy_id));
  const policiesAwaiting = (policies ?? []).filter((p) => !ackedPolicyIds.has(p.id));

  return (
    <div className="max-w-[1100px]">
      <div className="flex flex-col items-start gap-6 rounded-xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center">
        <div className="flex-1">
          <LiveClock />
          <div className="mt-2.5 flex items-center gap-2">
            <span className={`h-[7px] w-[7px] rounded-full ${clockedIn ? "bg-green-600" : "bg-gray-300"}`} />
            <span className="text-[13px] text-gray-600">{statusText}</span>
            <span className="ml-2 text-[12.5px] text-gray-400 tabular-nums">
              &middot; {formatMinutes(card.totalMinutes)} this week
            </span>
          </div>
        </div>
        <form action={clockedIn ? clockOut : clockIn}>
          <button
            type="submit"
            className={`h-14 rounded-[10px] px-8 text-[13px] font-bold tracking-[.12em] uppercase shadow-sm transition-opacity hover:opacity-90 ${
              clockedIn
                ? "border border-[var(--brand-primary)] bg-white text-[var(--brand-primary)]"
                : "bg-[var(--brand-accent)] text-[#06323A]"
            }`}
          >
            {clockedIn ? "Clock out" : "Clock in"}
          </button>
        </form>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4.5 py-3.5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[var(--brand-primary)]" />
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Training due</h2>
            </div>
            <span className="text-[11.5px] text-gray-400">{trainingDue.length} remaining</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {trainingDue.map((m) => (
              <li key={m.id} className="px-4.5 py-3">
                <p className="text-[13.5px] font-medium text-gray-900">{m.title}</p>
                <p className="text-[11.5px] text-gray-400">{m.category}</p>
              </li>
            ))}
            {trainingDue.length === 0 && (
              <li className="px-4.5 py-6 text-center text-sm text-gray-500">
                All required coursework complete.
              </li>
            )}
          </ul>
          <Link
            href="/training"
            className="block px-4.5 py-3 text-[12.5px] font-semibold text-[var(--brand-primary)] hover:opacity-80"
          >
            Open coursework &rarr;
          </Link>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4.5 py-3.5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--brand-primary)]" />
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Policies awaiting signature</h2>
            </div>
            <span className="text-[11.5px] text-gray-400">{policiesAwaiting.length} remaining</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {policiesAwaiting.map((p) => (
              <li key={p.id} className="px-4.5 py-3">
                <p className="text-[13.5px] font-medium text-gray-900">{p.title}</p>
                <p className="text-[11.5px] text-gray-400">{p.category}</p>
              </li>
            ))}
            {policiesAwaiting.length === 0 && (
              <li className="px-4.5 py-6 text-center text-sm text-gray-500">
                Everything&apos;s been acknowledged.
              </li>
            )}
          </ul>
          <Link
            href="/policies"
            className="block px-4.5 py-3 text-[12.5px] font-semibold text-[var(--brand-primary)] hover:opacity-80"
          >
            Open policies library &rarr;
          </Link>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4.5 py-3.5">
            <div className="flex items-center gap-2">
              <ClockAlert className="h-4 w-4 text-[var(--brand-primary)]" />
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">My credentials expiring</h2>
            </div>
            <span className="text-[11.5px] text-gray-400">Within 60 days</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {(expiringCreds ?? []).map((c, i) => (
              <li key={i} className="flex items-center justify-between px-4.5 py-3">
                <p className="text-[13.5px] font-medium text-gray-900">
                  {CREDENTIAL_LABELS[c.credential_type as CredentialType]}
                </p>
                <p className="text-[12.5px] text-gray-500 tabular-nums">{c.expires_at}</p>
              </li>
            ))}
            {(expiringCreds ?? []).length === 0 && (
              <li className="px-4.5 py-6 text-center text-sm text-gray-500">Nothing expiring soon.</li>
            )}
          </ul>
          <Link
            href="/profile"
            className="block px-4.5 py-3 text-[12.5px] font-semibold text-[var(--brand-primary)] hover:opacity-80"
          >
            View my profile &rarr;
          </Link>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4.5 py-3.5">
            <Megaphone className="h-4 w-4 text-gray-300" />
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Announcements</h2>
          </div>
          <div className="px-4.5 py-6 text-center text-sm text-gray-500">
            Nothing posted yet.
          </div>
        </section>
      </div>
    </div>
  );
}
