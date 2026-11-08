"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type WaitlistActionState = { message?: string } | undefined;

/**
 * Moves a waitlisted child to active. This starts billing: the child begins
 * generating prorated tuition on the next generation run for the period
 * containing startDate, so startDate is required rather than defaulted.
 *
 * desired_start_date is deliberately retained -- it records what the family
 * originally asked for, which stays useful beside the actual start_date.
 */
export async function enrollFromWaitlist(
  prevState: WaitlistActionState,
  formData: FormData,
): Promise<WaitlistActionState> {
  const session = await requireRole(["director", "platform_admin"]);

  const childId = formData.get("childId");
  const startDate = formData.get("startDate");
  const roomIdRaw = formData.get("roomId");

  if (typeof childId !== "string" || !childId) {
    return { message: "Missing child." };
  }
  if (typeof startDate !== "string" || !startDate.trim()) {
    return { message: "Set a start date — billing prorates from it." };
  }

  const roomId = typeof roomIdRaw === "string" && roomIdRaw ? roomIdRaw : null;

  const supabase = await createClient();

  const update: {
    status: "active";
    start_date: string;
    waitlisted_at: null;
    room_id?: string;
  } = {
    status: "active",
    start_date: startDate,
    waitlisted_at: null,
  };
  // Only overwrite the room when one was chosen; never clear an existing
  // assignment by enrolling without picking a room.
  if (roomId) {
    // roomId arrives from a hidden form field, so it must be verified to
    // belong to this director's own tenant before writing it onto the
    // child -- the room_id FK has no tenancy check of its own, so a
    // crafted POST could otherwise point a child at another tenant's room.
    // Mirrors the invoiceId ownership check in recordPayment
    // (src/lib/billing/actions.ts).
    const { data: room } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", roomId)
      .eq("tenant_id", session.profile.tenantId)
      .maybeSingle();

    if (!room) return { message: "That room isn't available." };

    update.room_id = roomId;
  }

  // RLS blocks rather than errors, so a blocked update returns zero rows.
  const { data, error } = await supabase
    .from("children")
    .update(update)
    .eq("id", childId)
    .eq("tenant_id", session.profile.tenantId)
    .eq("status", "waitlisted")
    .select("id")
    .maybeSingle();

  if (error) return { message: "Couldn't enroll this child. Try again." };
  if (!data) return { message: "This child is no longer on the waitlist." };

  revalidatePath("/waitlist");
  revalidatePath("/children");
  revalidatePath(`/children/${childId}`);
  revalidatePath("/dashboard");
}

/**
 * Creating and editing rooms.
 *
 * There was no way to make a room at all before this -- not in the UI, not in
 * an action -- which is why the tenant has five campuses and zero classrooms.
 * Without rooms the portal cannot tell anybody a room is full, so "can I take
 * another two-year-old?" stays a question you answer from memory.
 *
 * Open to staff: naming the rooms you work in every day is not a financial
 * decision, and making a director do it is how it never gets done.
 */
export type RoomActionState = { message?: string; ok?: boolean } | undefined;

const ROOM_ROLES = ["director", "platform_admin", "staff"] as const;

export async function saveRoom(
  prevState: RoomActionState,
  formData: FormData,
): Promise<RoomActionState> {
  const session = await requireRole([...ROOM_ROLES]);

  const roomId = text(formData, "roomId");
  const name = text(formData, "name");
  const locationId = text(formData, "locationId");

  if (!name) return { message: "Give the room a name." };
  if (!locationId) return { message: "Choose which campus this room is at." };

  const capacity = optionalInt(formData, "capacity");
  if (capacity === "invalid") return { message: "Capacity must be a whole number." };

  const minAge = optionalInt(formData, "minAgeMonths");
  const maxAge = optionalInt(formData, "maxAgeMonths");
  if (minAge === "invalid" || maxAge === "invalid") {
    return { message: "Ages must be whole numbers of months." };
  }
  // Caught here rather than at the database, because "18 to 6 months" is a
  // typo a person can fix, not an error they should meet as a 500.
  if (minAge !== null && maxAge !== null && minAge > maxAge) {
    return { message: "The youngest age can't be older than the oldest age." };
  }

  const supabase = await createClient();

  const values = {
    location_id: locationId,
    name,
    capacity,
    min_age_months: minAge,
    max_age_months: maxAge,
    is_active: formData.get("isActive") !== "off",
  };

  if (roomId) {
    const { error } = await supabase
      .from("rooms")
      .update(values)
      .eq("id", roomId)
      .eq("tenant_id", session.profile.tenantId);
    if (error) return { message: "That room could not be saved. Please try again." };
  } else {
    const { error } = await supabase
      .from("rooms")
      .insert({ ...values, tenant_id: session.profile.tenantId });
    if (error) return { message: "That room could not be created. Please try again." };
  }

  revalidatePath("/settings");
  revalidatePath("/children");
  revalidatePath("/attendance/children");
  return { ok: true, message: roomId ? "Room saved." : `${name} added.` };
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** null when blank, "invalid" when present but not a whole number. */
function optionalInt(formData: FormData, key: string): number | null | "invalid" {
  const raw = text(formData, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return "invalid";
  return parsed;
}
