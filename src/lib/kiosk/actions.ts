"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KioskActionResult, KioskIdentifyResult } from "@/lib/kiosk/definitions";

const GENERIC_KIOSK_ERROR = "This kiosk isn't set up. Contact your director.";
const SESSION_EXPIRED = "That took too long — enter your PIN again.";

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Public, unauthenticated entry point -- the device token (from the URL)
// and PIN are the only credentials here, verified entirely server-side via
// kiosk_identify_pin() (device-scoped lockout, tenant-unique PIN match,
// full audit log -- see the kiosk_access migration). This never mints a
// Supabase session; a kiosk_sessions row is a short-lived, single-purpose
// bearer token for the next clock/incident write only, same pattern as
// /forms/fill's token, not a login.
export async function kioskIdentify(deviceToken: string, pin: string): Promise<KioskIdentifyResult> {
  if (!/^[0-9]{4,6}$/.test(pin)) {
    return { ok: false, message: "Incorrect PIN." };
  }

  const admin = createAdminClient();

  const { data: device } = await admin
    .from("kiosk_devices")
    .select("id, tenant_id, location_id, is_active")
    .eq("device_token", deviceToken)
    .maybeSingle();

  if (!device || !device.is_active) {
    return { ok: false, message: GENERIC_KIOSK_ERROR };
  }

  const { data: profileId } = await admin.rpc("kiosk_identify_pin", {
    p_device_token: deviceToken,
    p_pin: pin,
  });

  if (!profileId) {
    return { ok: false, message: "Incorrect PIN." };
  }

  const [{ data: profile }, { data: session }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", profileId).single(),
    admin
      .from("kiosk_sessions")
      .insert({
        device_id: device.id,
        profile_id: profileId,
        tenant_id: device.tenant_id,
        location_id: device.location_id,
      })
      .select("id")
      .single(),
  ]);

  if (!session) {
    return { ok: false, message: GENERIC_KIOSK_ERROR };
  }

  const { data: attendanceRow } = await admin
    .from("attendance")
    .select("id, clock_in_at, clock_out_at")
    .eq("staff_id", profileId)
    .eq("date", today())
    .maybeSingle();

  const clockedIn = Boolean(attendanceRow?.clock_in_at && !attendanceRow?.clock_out_at);

  let onBreak = false;
  if (attendanceRow) {
    const { data: openBreak } = await admin
      .from("attendance_breaks")
      .select("id")
      .eq("attendance_id", attendanceRow.id)
      .is("ended_at", null)
      .maybeSingle();
    onBreak = Boolean(openBreak);
  }

  const { data: rooms } = await admin
    .from("rooms")
    .select("id, name")
    .eq("location_id", device.location_id)
    .eq("is_active", true)
    .order("name");

  return {
    ok: true,
    sessionToken: session.id,
    fullName: profile?.full_name ?? "there",
    clockedIn,
    onBreak,
    rooms: rooms ?? [],
  };
}

async function resolveSession(sessionToken: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("kiosk_sessions")
    .select("id, device_id, profile_id, tenant_id, location_id, expires_at")
    .eq("id", sessionToken)
    .maybeSingle();

  if (!data || new Date(data.expires_at) < new Date()) return null;
  return data;
}

export async function kioskClockIn(sessionToken: string): Promise<KioskActionResult> {
  const session = await resolveSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };

  const admin = createAdminClient();
  await admin.from("attendance").upsert(
    {
      tenant_id: session.tenant_id,
      location_id: session.location_id,
      staff_id: session.profile_id,
      date: today(),
      clock_in_at: new Date().toISOString(),
      clock_out_at: null,
      source: "kiosk",
    },
    { onConflict: "staff_id,date" },
  );

  revalidatePath("/attendance");
  return { ok: true, message: "Clocked in." };
}

export async function kioskClockOut(sessionToken: string): Promise<KioskActionResult> {
  const session = await resolveSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };

  const admin = createAdminClient();
  await admin
    .from("attendance")
    .update({ clock_out_at: new Date().toISOString() })
    .eq("staff_id", session.profile_id)
    .eq("date", today());

  revalidatePath("/attendance");
  return { ok: true, message: "Clocked out." };
}

export async function kioskStartBreak(sessionToken: string): Promise<KioskActionResult> {
  const session = await resolveSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };

  const admin = createAdminClient();
  const { data: attendanceRow } = await admin
    .from("attendance")
    .select("id")
    .eq("staff_id", session.profile_id)
    .eq("date", today())
    .maybeSingle();

  if (!attendanceRow) {
    return { ok: false, message: "Clock in before starting a break." };
  }

  await admin.from("attendance_breaks").insert({ attendance_id: attendanceRow.id });
  return { ok: true, message: "Break started." };
}

export async function kioskEndBreak(sessionToken: string): Promise<KioskActionResult> {
  const session = await resolveSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };

  const admin = createAdminClient();
  const { data: attendanceRow } = await admin
    .from("attendance")
    .select("id")
    .eq("staff_id", session.profile_id)
    .eq("date", today())
    .maybeSingle();

  if (!attendanceRow) {
    return { ok: false, message: "No shift on file for today." };
  }

  await admin
    .from("attendance_breaks")
    .update({ ended_at: new Date().toISOString() })
    .eq("attendance_id", attendanceRow.id)
    .is("ended_at", null);

  return { ok: true, message: "Break ended." };
}

export async function kioskTransferRoom(sessionToken: string, roomId: string): Promise<KioskActionResult> {
  const session = await resolveSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };
  if (!roomId) return { ok: false, message: "Pick a room." };

  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("id, name")
    .eq("id", roomId)
    .eq("location_id", session.location_id)
    .maybeSingle();

  if (!room) return { ok: false, message: "Pick a room." };

  await admin.from("room_transfers").insert({
    tenant_id: session.tenant_id,
    location_id: session.location_id,
    staff_id: session.profile_id,
    room_id: room.id,
  });

  return { ok: true, message: `Moved to ${room.name}.` };
}

export async function kioskFileIncident(
  sessionToken: string,
  whatHappened: string,
  actionTaken: string,
  childName: string,
): Promise<KioskActionResult> {
  const session = await resolveSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };

  if (!whatHappened.trim() || !actionTaken.trim()) {
    return { ok: false, message: "Fill out what happened and the action taken." };
  }

  const admin = createAdminClient();
  await admin.from("incident_reports").insert({
    tenant_id: session.tenant_id,
    location_id: session.location_id,
    filed_by: session.profile_id,
    child_name: childName.trim() || "Unspecified",
    what_happened: whatHappened.trim(),
    action_taken: actionTaken.trim(),
  });

  revalidatePath("/incidents");
  return { ok: true, message: "Incident report filed." };
}

// ── Director-facing kiosk management (authenticated, RLS-enforced) ──────

export async function createKioskDevice(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const locationId = formData.get("locationId");
  const name = formData.get("name");

  if (typeof locationId !== "string" || !locationId || typeof name !== "string" || !name.trim()) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("kiosk_devices").insert({
    tenant_id: session.profile.tenantId,
    location_id: locationId,
    name: name.trim(),
  });

  revalidatePath("/settings");
}

export async function deactivateKioskDevice(formData: FormData) {
  await requireRole(["director", "platform_admin"]);
  const deviceId = formData.get("deviceId");
  if (typeof deviceId !== "string") return;

  const supabase = await createClient();
  await supabase.from("kiosk_devices").update({ is_active: false }).eq("id", deviceId);

  revalidatePath("/settings");
}

export async function createRoom(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const locationId = formData.get("locationId");
  const name = formData.get("name");

  if (typeof locationId !== "string" || !locationId || typeof name !== "string" || !name.trim()) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("rooms").insert({
    tenant_id: session.profile.tenantId,
    location_id: locationId,
    name: name.trim(),
  });

  revalidatePath("/settings");
}

// Generates a random 4-digit PIN, retrying on a tenant-wide collision
// (admin_set_staff_pin() enforces uniqueness -- see the kiosk_access
// migration for why that matters). Returns the plaintext exactly once so
// the director's UI can display it; nothing stores it beyond the hash.
export async function resetStaffPin(
  _state: { message?: string; pin?: string } | undefined,
  formData: FormData,
): Promise<{ message?: string; pin?: string }> {
  await requireRole(["director", "platform_admin"]);
  const staffId = formData.get("staffId");
  if (typeof staffId !== "string" || !staffId) {
    return { message: "Missing staff member." };
  }

  const supabase = await createClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = String(Math.floor(1000 + Math.random() * 9000));
    const { error } = await supabase.rpc("admin_set_staff_pin", { p_staff_id: staffId, p_pin: candidate });
    if (!error) {
      return { pin: candidate };
    }
    if (!error.message.includes("pin_taken")) {
      return { message: "Couldn't set a PIN. Try again." };
    }
  }

  return { message: "Couldn't find a free PIN. Try again." };
}
