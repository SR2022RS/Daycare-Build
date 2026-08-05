"use server";

import { revalidatePath } from "next/cache";

import { requireRole, verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveLocationId } from "@/lib/tenant/location-cookie";

async function resolveLocationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staffId: string,
) {
  const active = await getActiveLocationId();
  if (active) return active;

  const { data } = await supabase
    .from("staff_locations")
    .select("location_id")
    .eq("staff_id", staffId)
    .limit(1)
    .maybeSingle();

  return data?.location_id ?? null;
}

// Attendance dates key off the *center's* local calendar day, not UTC --
// an 8pm EDT clock-in is UTC-tomorrow, and blindly using
// toISOString().slice(0, 10) would file that shift under the wrong date on
// dashboards/payroll exports.
function dateKeyInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );
}

// Staff writes go through the admin client (bypassing RLS) because the
// attendance_write RLS policy is now director/platform_admin-only -- direct
// staff writes were removed so a staffer can't call the Supabase API
// directly to fabricate clock times. Authorization here comes entirely from
// verifySession() plus the narrow, hardcoded shape of each write below.
export async function clockIn() {
  const session = await verifySession();
  const supabase = await createClient();
  const locationId = await resolveLocationId(supabase, session.profile.id);

  if (!locationId) {
    return;
  }

  const admin = createAdminClient();
  const { data: location } = await admin.from("locations").select("timezone").eq("id", locationId).single();
  const today = dateKeyInTimezone(new Date(), location?.timezone ?? "America/New_York");

  const { data: existing } = await admin
    .from("attendance")
    .select("id, clock_out_at")
    .eq("staff_id", session.profile.id)
    .eq("date", today)
    .maybeSingle();

  // Idempotent: already clocked in (and not yet out) or already completed a
  // shift today -- either way, don't clobber clock_out_at with a bare
  // re-submitted clock-in.
  if (existing) {
    revalidatePath("/attendance");
    return;
  }

  await admin.from("attendance").insert({
    tenant_id: session.profile.tenantId,
    location_id: locationId,
    staff_id: session.profile.id,
    date: today,
    clock_in_at: new Date().toISOString(),
  });

  revalidatePath("/attendance");
}

export async function clockOut() {
  const session = await verifySession();
  const admin = createAdminClient();

  // Find the caller's own open shift (not yet clocked out) rather than
  // recomputing "today" -- avoids double timezone math and correctly closes
  // a shift that started before local midnight.
  const { data: open } = await admin
    .from("attendance")
    .select("id")
    .eq("staff_id", session.profile.id)
    .is("clock_out_at", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) {
    return;
  }

  await admin.from("attendance").update({ clock_out_at: new Date().toISOString() }).eq("id", open.id);

  revalidatePath("/attendance");
}

// Admin correction -- keeps the original clock in/out (first edit only, so
// repeat corrections don't overwrite the true original) plus who/when.
// Never auto-closes an open shift; this is the only path that touches an
// open shift's clock_out_at.
export async function correctAttendance(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const staffId = formData.get("staffId");
  const date = formData.get("date");
  const clockInLocal = formData.get("clockInAt");
  const clockOutLocal = formData.get("clockOutAt");
  const note = formData.get("note");
  const locationId = formData.get("locationId");

  if (typeof staffId !== "string" || typeof date !== "string" || !date) {
    return;
  }

  const clockInAt = typeof clockInLocal === "string" && clockInLocal ? new Date(clockInLocal).toISOString() : null;
  const clockOutAt =
    typeof clockOutLocal === "string" && clockOutLocal ? new Date(clockOutLocal).toISOString() : null;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("attendance")
    .select("id, clock_in_at, clock_out_at, original_clock_in_at, original_clock_out_at")
    .eq("staff_id", staffId)
    .eq("date", date)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("attendance")
      .update({
        clock_in_at: clockInAt,
        clock_out_at: clockOutAt,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        edited_by: session.profile.id,
        edited_at: new Date().toISOString(),
        // Only capture on the first-ever edit -- preserves the true original.
        original_clock_in_at: existing.original_clock_in_at ?? existing.clock_in_at,
        original_clock_out_at: existing.original_clock_out_at ?? existing.clock_out_at,
      })
      .eq("id", existing.id);
  } else {
    if (typeof locationId !== "string" || !locationId) return;
    await supabase.from("attendance").insert({
      tenant_id: session.profile.tenantId,
      location_id: locationId,
      staff_id: staffId,
      date,
      clock_in_at: clockInAt,
      clock_out_at: clockOutAt,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      source: "admin",
      edited_by: session.profile.id,
      edited_at: new Date().toISOString(),
    });
  }

  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/attendance");
}

// T2: staff can't self-edit clock times, but they can flag a day as wrong so
// an admin knows to look at it via correctAttendance. Only ever touches
// `note` on the caller's own row -- never clock times, never edited_by/at.
export async function flagAttendanceForReview(formData: FormData) {
  const session = await verifySession();
  const date = formData.get("date");
  const note = formData.get("note");

  if (typeof date !== "string" || !date || typeof note !== "string" || !note.trim()) {
    return;
  }

  await createAdminClient()
    .from("attendance")
    .update({ note: note.trim() })
    .eq("staff_id", session.profile.id)
    .eq("date", date);

  revalidatePath("/attendance");
}

export async function approveTimecard(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const staffId = formData.get("staffId");
  const weekStart = formData.get("weekStart");

  if (typeof staffId !== "string" || typeof weekStart !== "string" || !weekStart) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("timecard_approvals").upsert(
    {
      tenant_id: session.profile.tenantId,
      staff_id: staffId,
      week_start: weekStart,
      approved_by: session.profile.id,
      approved_at: new Date().toISOString(),
    },
    { onConflict: "staff_id,week_start" },
  );

  revalidatePath(`/staff/${staffId}`);
}
