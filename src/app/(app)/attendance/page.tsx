import Link from "next/link";
import { Download, ShieldAlert } from "lucide-react";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { clockIn, clockOut, flagAttendanceForReview } from "@/lib/attendance/actions";
import { addDays, formatMinutes, getMonday, getOpenShifts, getTimecard } from "@/lib/attendance/timecard";
import { LiveClock } from "@/components/attendance/live-clock";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await verifySession();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { week } = await searchParams;
  const currentWeekStart = getMonday(new Date());
  const weekStart =
    session.profile.role === "staff" && week && /^\d{4}-\d{2}-\d{2}$/.test(week)
      ? week
      : currentWeekStart;

  if (session.profile.role === "staff") {
    const [{ data: myAttendance }, card] = await Promise.all([
      supabase
        .from("attendance")
        .select("clock_in_at, clock_out_at")
        .eq("staff_id", session.profile.id)
        .eq("date", today)
        .maybeSingle(),
      getTimecard(supabase, session.profile.id, weekStart),
    ]);

    const clockedIn = Boolean(myAttendance?.clock_in_at) && !myAttendance?.clock_out_at;
    const statusText = myAttendance?.clock_in_at
      ? `Clocked in at ${new Date(myAttendance.clock_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
      : "Not clocked in today";

    return (
      <div className="max-w-[900px]">
        <div className="flex flex-col items-start gap-6 rounded-xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <LiveClock />
            <div className="mt-2.5 flex items-center gap-2">
              <span
                className={`h-[7px] w-[7px] rounded-full ${clockedIn ? "bg-green-600" : "bg-gray-300"}`}
              />
              <span className="text-[13px] text-gray-600">{statusText}</span>
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

        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">My timecard</h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/attendance?week=${addDays(weekStart, -7)}`}
                className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
              >
                &larr; Prev
              </Link>
              <span className="text-[12px] text-gray-500 tabular-nums">
                {card.weekStart} &ndash; {card.weekEnd}
              </span>
              {weekStart !== currentWeekStart ? (
                <Link
                  href={`/attendance?week=${addDays(weekStart, 7)}`}
                  className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
                >
                  Next &rarr;
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-md border border-gray-100 px-2.5 py-1 text-xs font-medium text-gray-300">
                  Next &rarr;
                </span>
              )}
            </div>
            <span className="text-[11.5px] text-gray-400">
              {formatMinutes(card.totalMinutes)} total
              {card.otMinutes > 0 ? ` (${formatMinutes(card.otMinutes)} OT)` : ""}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3 border-b border-gray-100 bg-gray-50 px-4.5 py-2.5 text-[10px] font-bold tracking-[.13em] text-gray-400 uppercase">
            <span>Date</span>
            <span>Clock in</span>
            <span>Clock out</span>
            <span className="text-right">Total</span>
          </div>
          {card.days.map((d) => (
            <details key={d.date} className="group border-b border-gray-100 last:border-b-0">
              <summary className="grid cursor-pointer grid-cols-4 gap-3 px-4.5 py-2.5 text-[13px] text-gray-700 tabular-nums hover:bg-gray-50">
                <span className="font-medium text-gray-900">
                  {d.weekday} {d.date}
                </span>
                <span>{d.clockIn ?? "—"}</span>
                <span className={d.open ? "font-medium text-amber-700" : ""}>
                  {d.clockOut ?? (d.open ? "On shift" : "—")}
                </span>
                <span className="text-right text-gray-500">
                  {d.totalMinutes > 0 ? formatMinutes(d.totalMinutes) : "—"}
                  {d.note && <span className="ml-1 text-[10px] text-amber-600">(flagged)</span>}
                </span>
              </summary>
              {!card.approved && d.attendanceId && (
                <form
                  action={flagAttendanceForReview}
                  className="flex flex-wrap items-end gap-2 border-t border-gray-100 bg-gray-50 px-4.5 py-3"
                >
                  <input type="hidden" name="date" value={d.date} />
                  <label className="flex min-w-[200px] flex-1 flex-col text-xs text-gray-500">
                    Something wrong with this day?
                    <input
                      type="text"
                      name="note"
                      defaultValue={d.note ?? ""}
                      placeholder="e.g. forgot to clock out at 5pm, not 11pm"
                      className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Flag for admin review
                  </button>
                </form>
              )}
            </details>
          ))}
          {card.approved && (
            <div className="px-4.5 py-2.5 text-[11.5px] text-green-700">
              Timecard approved for this week.
            </div>
          )}
        </div>
      </div>
    );
  }

  const [{ data: rows }, openShifts] = await Promise.all([
    supabase
      .from("attendance")
      .select("clock_in_at, clock_out_at, profiles(full_name)")
      .eq("tenant_id", session.profile.tenantId)
      .eq("date", today),
    getOpenShifts(supabase, session.profile.tenantId),
  ]);

  return (
    <div className="max-w-[1240px]">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4.5 py-3.5">
        <span className="text-[13px] text-gray-600">
          {`Payroll export for the week of ${weekStart} (Mon–Sun, OT over 40h/week)`}
        </span>
        <Link
          href={`/attendance/export?week=${weekStart}`}
          className="flex items-center gap-1.5 rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-semibold text-[#06323A] hover:opacity-90"
        >
          <Download className="h-3.5 w-3.5" />
          Export payroll CSV
        </Link>
      </div>

      <div className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4.5 py-3.5">
          <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">On the clock now</h2>
          <span className="text-[11.5px] text-gray-400">{openShifts.length} active</span>
        </div>
        {openShifts.map((shift) => (
          <Link
            key={shift.attendanceId}
            href={`/staff/${shift.staffId}`}
            className="flex items-center justify-between gap-3 border-b border-gray-100 px-4.5 py-3 hover:bg-gray-50"
          >
            <div>
              <p className="text-[13.5px] font-medium text-gray-900">{shift.staffName}</p>
              <p className="text-[11.5px] text-gray-400">{shift.locationName ?? "No location"}</p>
            </div>
            <div className="text-right">
              <p className="text-[12.5px] text-gray-500 tabular-nums">
                Since{" "}
                {new Date(shift.clockInAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              {shift.needsCorrection && (
                <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-semibold text-red-700">
                  <ShieldAlert className="h-3 w-3" /> Needs correction
                </p>
              )}
            </div>
          </Link>
        ))}
        {openShifts.length === 0 && (
          <div className="px-4.5 py-6 text-sm text-gray-500">No one is currently clocked in.</div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4.5 py-3.5">
          <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Today&apos;s attendance</h2>
          <span className="text-[11.5px] text-gray-400">{today}</span>
        </div>
        {(rows ?? []).map((row, i) => {
          const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-gray-100 px-4.5 py-3"
            >
              <p className="text-[13.5px] font-medium text-gray-900">{profile?.full_name}</p>
              <p className="text-[12.5px] text-gray-500 tabular-nums">
                {row.clock_in_at
                  ? new Date(row.clock_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                  : "—"}
                {" → "}
                {row.clock_out_at
                  ? new Date(row.clock_out_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                  : "—"}
              </p>
            </div>
          );
        })}
        {(rows ?? []).length === 0 && (
          <div className="px-4.5 py-6 text-sm text-gray-500">No attendance recorded today.</div>
        )}
      </div>
    </div>
  );
}
