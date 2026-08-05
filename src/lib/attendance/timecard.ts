import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

const OT_THRESHOLD_MINUTES = 40 * 60;
// "the center runs 6:00am-11:00pm -- long evening shifts are normal, open-
// ended ones are not" -- flag, never auto-close.
const OPEN_SHIFT_CORRECTION_HOURS = 17;

export function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Local-time value for a <input type="datetime-local"> defaultValue.
export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export interface TimecardDay {
  attendanceId: string | null;
  date: string;
  weekday: string;
  clockIn: string | null;
  clockOut: string | null;
  rawClockInAt: string | null;
  rawClockOutAt: string | null;
  totalMinutes: number;
  open: boolean;
  needsCorrection: boolean;
  edited: boolean;
  note: string | null;
}

export interface Timecard {
  weekStart: string;
  weekEnd: string;
  days: TimecardDay[];
  totalMinutes: number;
  regularMinutes: number;
  otMinutes: number;
  approved: boolean;
  approvedAt: string | null;
}

export async function getTimecard(
  supabase: SupabaseClient<Database>,
  staffId: string,
  weekStart: string,
): Promise<Timecard> {
  const weekEnd = addDays(weekStart, 6);
  const now = Date.now();

  const [{ data: rows }, { data: approval }] = await Promise.all([
    supabase
      .from("attendance")
      .select("id, date, clock_in_at, clock_out_at, original_clock_in_at, note")
      .eq("staff_id", staffId)
      .gte("date", weekStart)
      .lte("date", weekEnd),
    supabase
      .from("timecard_approvals")
      .select("approved_at")
      .eq("staff_id", staffId)
      .eq("week_start", weekStart)
      .maybeSingle(),
  ]);

  const byDate = new Map((rows ?? []).map((r) => [r.date, r]));
  const days: TimecardDay[] = [];
  let totalMinutes = 0;

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const row = byDate.get(date);
    const weekday = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });

    if (!row) {
      days.push({
        attendanceId: null,
        date,
        weekday,
        clockIn: null,
        clockOut: null,
        rawClockInAt: null,
        rawClockOutAt: null,
        totalMinutes: 0,
        open: false,
        needsCorrection: false,
        edited: false,
        note: null,
      });
      continue;
    }

    const open = Boolean(row.clock_in_at) && !row.clock_out_at;
    const hoursOpen = open ? (now - new Date(row.clock_in_at as string).getTime()) / 3_600_000 : 0;
    const minutes =
      row.clock_in_at && row.clock_out_at
        ? Math.round(
            (new Date(row.clock_out_at).getTime() - new Date(row.clock_in_at).getTime()) / 60000,
          )
        : 0;
    totalMinutes += minutes;

    days.push({
      attendanceId: row.id,
      date,
      weekday,
      clockIn: row.clock_in_at ? formatTime(row.clock_in_at) : null,
      clockOut: row.clock_out_at ? formatTime(row.clock_out_at) : null,
      rawClockInAt: row.clock_in_at,
      rawClockOutAt: row.clock_out_at,
      totalMinutes: minutes,
      open,
      needsCorrection: open && hoursOpen > OPEN_SHIFT_CORRECTION_HOURS,
      edited: Boolean(row.original_clock_in_at),
      note: row.note,
    });
  }

  return {
    weekStart,
    weekEnd,
    days,
    totalMinutes,
    regularMinutes: Math.min(totalMinutes, OT_THRESHOLD_MINUTES),
    otMinutes: Math.max(0, totalMinutes - OT_THRESHOLD_MINUTES),
    approved: Boolean(approval?.approved_at),
    approvedAt: approval?.approved_at ?? null,
  };
}

export interface OpenShift {
  attendanceId: string;
  staffId: string;
  staffName: string;
  locationName: string | null;
  clockInAt: string;
  hoursOpen: number;
  needsCorrection: boolean;
}

export async function getOpenShifts(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<OpenShift[]> {
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  const { data } = await supabase
    .from("attendance")
    .select("id, staff_id, clock_in_at, profiles(full_name), locations(name)")
    .eq("tenant_id", tenantId)
    .eq("date", today)
    .not("clock_in_at", "is", null)
    .is("clock_out_at", null);

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const location = Array.isArray(row.locations) ? row.locations[0] : row.locations;
    const clockInAt = row.clock_in_at as string;
    const hoursOpen = (now - new Date(clockInAt).getTime()) / 3_600_000;
    return {
      attendanceId: row.id,
      staffId: row.staff_id,
      staffName: profile?.full_name ?? "Unknown",
      locationName: location?.name ?? null,
      clockInAt,
      hoursOpen,
      needsCorrection: hoursOpen > OPEN_SHIFT_CORRECTION_HOURS,
    };
  });
}
