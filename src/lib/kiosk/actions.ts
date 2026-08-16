"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  GuardianIdentity,
  KioskActionResult,
  KioskIdentifyResult,
  StaffRosterResult,
} from "@/lib/kiosk/definitions";
import { mapChildAttendanceError as mapChildAttendanceErrorPure } from "@/lib/kiosk/errors";

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

  // kiosk_sessions.profile_id is nullable now that guardian sessions share
  // the table (see kiosk_sessions_actor). Every action below is staff-only
  // (clock in/out, breaks, room transfers, incident filing), so a guardian
  // session -- profile_id null -- is not a valid session here.
  if (!data || new Date(data.expires_at) < new Date() || !data.profile_id) return null;
  return { ...data, profile_id: data.profile_id };
}

// Mirror image of resolveSession, for the same reason in the other
// direction: guardian actions (check a child in/out) must never be
// satisfiable by a staff session. profile_id null, guardian_id set is the
// only shape that resolves here.
async function resolveGuardianSession(sessionToken: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("kiosk_sessions")
    .select("id, device_id, guardian_id, tenant_id, location_id, expires_at")
    .eq("id", sessionToken)
    .maybeSingle();

  if (!data || new Date(data.expires_at) < new Date() || !data.guardian_id) return null;
  return { ...data, guardian_id: data.guardian_id };
}

// See src/lib/kiosk/errors.ts for the mapping itself and why it lives in its
// own module (a "use server" file may only export async functions, so the
// pure, unit-testable version can't live here).
function mapChildAttendanceError(message: string | undefined): string {
  return mapChildAttendanceErrorPure(message, GENERIC_KIOSK_ERROR);
}

async function guardianChildrenWithPresence(
  admin: ReturnType<typeof createAdminClient>,
  guardianId: string,
  locationId: string,
): Promise<Extract<GuardianIdentity, { ok: true }>["children"]> {
  const { data: links } = await admin.from("child_guardians").select("child_id").eq("guardian_id", guardianId);
  const childIds = (links ?? []).map((link) => link.child_id);
  if (childIds.length === 0) return [];

  const { data: children } = await admin
    .from("children")
    .select("id, full_name, room_id")
    .in("id", childIds)
    .eq("location_id", locationId)
    .eq("status", "active");

  if (!children || children.length === 0) return [];

  const roomIds = children.map((child) => child.room_id).filter((id): id is string => Boolean(id));

  const [{ data: rooms }, { data: openVisits }] = await Promise.all([
    roomIds.length
      ? admin.from("rooms").select("id, name").in("id", roomIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin
      .from("child_attendance")
      .select("child_id")
      .in(
        "child_id",
        children.map((child) => child.id),
      )
      .is("checked_out_at", null),
  ]);

  const roomNameById = new Map((rooms ?? []).map((room) => [room.id, room.name]));
  const presentChildIds = new Set((openVisits ?? []).map((visit) => visit.child_id));

  return children.map((child) => ({
    id: child.id,
    fullName: child.full_name,
    roomName: child.room_id ? (roomNameById.get(child.room_id) ?? null) : null,
    present: presentChildIds.has(child.id),
  }));
}

// Same shape as kioskIdentify: regex-gate the PIN, look up the device by
// token, call the lockout-guarded RPC, mint a kiosk_sessions row -- this
// time with guardian_id set and profile_id left null -- and hand back a
// session token plus this guardian's children with today's presence, scoped
// to the kiosk's own location (a guardian with children at another location
// in the same tenant has nothing to do at this terminal).
export async function kioskIdentifyGuardian(deviceToken: string, pin: string): Promise<GuardianIdentity> {
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

  const { data: guardianId } = await admin.rpc("kiosk_identify_guardian_pin", {
    p_device_token: deviceToken,
    p_pin: pin,
  });

  if (!guardianId) {
    return { ok: false, message: "Incorrect PIN." };
  }

  const [{ data: guardian }, { data: session }] = await Promise.all([
    admin.from("guardians").select("full_name").eq("id", guardianId).single(),
    admin
      .from("kiosk_sessions")
      .insert({
        device_id: device.id,
        guardian_id: guardianId,
        tenant_id: device.tenant_id,
        location_id: device.location_id,
      })
      .select("id")
      .single(),
  ]);

  if (!session) {
    return { ok: false, message: GENERIC_KIOSK_ERROR };
  }

  const children = await guardianChildrenWithPresence(admin, guardianId, device.location_id);

  return {
    ok: true,
    sessionToken: session.id,
    guardianName: guardian?.full_name ?? "there",
    children,
  };
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

// A guardian checking a child in at the kiosk. childId arrives from the
// tablet and is never trusted: the first of two independent checks happens
// right here, before the RPC is ever called -- child_guardians is queried
// directly to confirm this session's guardian is actually linked to this
// child. kiosk_check_child_in repeats the same check server-side (defence
// in depth, not redundancy -- see the RPC's own comment on why one check
// isn't enough for a record a licensing audit reads), and p_room_id is left
// null so the RPC falls back to the child's assigned room; a guardian at
// this kiosk has no room picker.
export async function kioskCheckChildIn(sessionToken: string, childId: string): Promise<KioskActionResult> {
  const session = await resolveGuardianSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };
  if (!childId) return { ok: false, message: GENERIC_KIOSK_ERROR };

  const admin = createAdminClient();

  // Independent check #1 (action-side): does child_guardians actually link
  // this guardian to this child, AND is that child actually active at this
  // kiosk's own location? The link alone isn't enough -- a guardian with
  // children at two sites in one tenant could otherwise stand at the Site A
  // lobby tablet and check in a Site B child by id: the link check would
  // pass, the RPC's guardian_not_linked check would pass (it doesn't know
  // which kiosk called it), and the visit would write against the child's
  // own location_id, putting a phantom child in Site B's ratio while they
  // are actually at Site A. guardianChildrenWithPresence already scopes the
  // list this way; the action must be at least as strict as the list it
  // renders. Same message as a missing link on purpose -- a distinct
  // "wrong location" message would tell a caller which children exist at
  // which site.
  const [{ data: link }, { data: childAtLocation }] = await Promise.all([
    admin
      .from("child_guardians")
      .select("child_id")
      .eq("child_id", childId)
      .eq("guardian_id", session.guardian_id)
      .maybeSingle(),
    admin
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("location_id", session.location_id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (!link || !childAtLocation) {
    return { ok: false, message: "That child isn't linked to your account." };
  }

  // Independent check #2 (RPC-side): kiosk_check_child_in re-verifies the
  // guardian/child relationship and raises guardian_not_linked if it
  // doesn't hold.
  const { data: visitId, error } = await admin.rpc("kiosk_check_child_in", {
    p_child_id: childId,
    p_room_id: null,
    p_guardian_id: session.guardian_id,
    p_staff_id: null,
  });

  if (error || !visitId) {
    return { ok: false, message: mapChildAttendanceError(error?.message) };
  }

  revalidatePath("/attendance");
  return { ok: true, message: "Checked in." };
}

// Mirror of kioskCheckChildIn for checkout. no_open_visit is the one
// exception here that a guardian can act on -- it means this child was
// already checked out (double-tap, or checked out by someone else moments
// earlier), not a system error.
export async function kioskCheckChildOut(sessionToken: string, childId: string): Promise<KioskActionResult> {
  const session = await resolveGuardianSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };
  if (!childId) return { ok: false, message: GENERIC_KIOSK_ERROR };

  const admin = createAdminClient();

  // Same pair of independent checks as kioskCheckChildIn -- see that
  // function's comment. Checkout has the same phantom-location failure mode
  // as check-in (a Site A guardian closing a Site B child's visit by id) so
  // it gets the identical location scoping, not just the link check.
  const [{ data: link }, { data: childAtLocation }] = await Promise.all([
    admin
      .from("child_guardians")
      .select("child_id")
      .eq("child_id", childId)
      .eq("guardian_id", session.guardian_id)
      .maybeSingle(),
    admin
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("location_id", session.location_id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (!link || !childAtLocation) {
    return { ok: false, message: "That child isn't linked to your account." };
  }

  const { data: visitId, error } = await admin.rpc("kiosk_check_child_out", {
    p_child_id: childId,
    p_guardian_id: session.guardian_id,
    p_staff_id: null,
    p_override_reason: null,
  });

  if (error || !visitId) {
    return { ok: false, message: mapChildAttendanceError(error?.message) };
  }

  revalidatePath("/attendance");
  return { ok: true, message: "Checked out." };
}

// Staff vouching for a child, not a guardian authenticating -- resolves a
// STAFF session (resolveSession, which already refuses a guardian session)
// and calls the RPCs with p_staff_id set and p_guardian_id null, so the
// written row records "staff vouched" rather than "the guardian
// authenticated." Staff have no per-child link table to re-check the way
// guardians do; what still must never be trusted is childId itself, so it
// is re-resolved here against the children table scoped to this session's
// own tenant and location before the RPC is ever called.
export async function kioskStaffCheckChild(
  sessionToken: string,
  childId: string,
  direction: "in" | "out",
): Promise<KioskActionResult> {
  const session = await resolveSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };
  if (!childId) return { ok: false, message: GENERIC_KIOSK_ERROR };

  const admin = createAdminClient();

  const { data: child } = await admin
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("tenant_id", session.tenant_id)
    .eq("location_id", session.location_id)
    .maybeSingle();

  if (!child) {
    return { ok: false, message: "Could not find that child at this location." };
  }

  const rpcArgs = {
    p_guardian_id: null,
    p_staff_id: session.profile_id,
  };

  if (direction === "in") {
    const { data: visitId, error } = await admin.rpc("kiosk_check_child_in", {
      p_child_id: childId,
      p_room_id: null,
      ...rpcArgs,
    });

    if (error || !visitId) {
      return { ok: false, message: mapChildAttendanceError(error?.message) };
    }

    revalidatePath("/attendance");
    return { ok: true, message: "Checked in." };
  }

  const { data: visitId, error } = await admin.rpc("kiosk_check_child_out", {
    p_child_id: childId,
    p_override_reason: null,
    ...rpcArgs,
  });

  if (error || !visitId) {
    return { ok: false, message: mapChildAttendanceError(error?.message) };
  }

  revalidatePath("/attendance");
  return { ok: true, message: "Checked out." };
}

// The staff roster screen at the kiosk (Task 5's "I'm staff" -> menu ->
// child check-in/out flow). No existing action returned "every child at this
// location, grouped by room, with today's presence" -- kioskIdentify only
// returns the staff member's own clock state, and
// guardianChildrenWithPresence is scoped to one guardian's linked children.
// This mirrors that helper's shape (same room-lookup + open-visit-set
// pattern) but starts from every active child at the session's own
// tenant+location rather than a guardian's linked subset, since staff may
// vouch for any child at their location (see kioskStaffCheckChild above).
// Gated by resolveSession, so only a staff session -- never a guardian one
// -- can pull this list, and it is scoped to session.tenant_id AND
// session.location_id, the same two-column scope kioskStaffCheckChild
// re-checks before writing.
export async function kioskStaffRoster(sessionToken: string): Promise<StaffRosterResult> {
  const session = await resolveSession(sessionToken);
  if (!session) return { ok: false, message: SESSION_EXPIRED };

  const admin = createAdminClient();

  const { data: children } = await admin
    .from("children")
    .select("id, full_name, room_id")
    .eq("tenant_id", session.tenant_id)
    .eq("location_id", session.location_id)
    .eq("status", "active")
    .order("full_name");

  if (!children || children.length === 0) {
    return { ok: true, rooms: [], unassigned: [] };
  }

  const roomIds = [...new Set(children.map((child) => child.room_id).filter((id): id is string => Boolean(id)))];

  const [{ data: rooms }, { data: openVisits }] = await Promise.all([
    roomIds.length
      ? admin.from("rooms").select("id, name").in("id", roomIds).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin
      .from("child_attendance")
      .select("child_id")
      .in(
        "child_id",
        children.map((child) => child.id),
      )
      .is("checked_out_at", null),
  ]);

  const presentChildIds = new Set((openVisits ?? []).map((visit) => visit.child_id));

  type RosterChild = { id: string; fullName: string; present: boolean };
  const roomsById = new Map<string, { id: string; name: string; children: RosterChild[] }>(
    (rooms ?? []).map((room) => [room.id, { id: room.id, name: room.name, children: [] }]),
  );
  const unassigned: RosterChild[] = [];

  for (const child of children) {
    const entry = { id: child.id, fullName: child.full_name, present: presentChildIds.has(child.id) };
    const room = child.room_id ? roomsById.get(child.room_id) : undefined;
    if (room) {
      room.children.push(entry);
    } else {
      unassigned.push(entry);
    }
  }

  return { ok: true, rooms: [...roomsById.values()], unassigned };
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
