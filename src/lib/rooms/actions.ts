"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { todayISO } from "@/lib/billing/dates";
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
  if (roomId) update.room_id = roomId;

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

/** Puts a child on the waitlist, stamping today in the center's timezone. */
export async function addToWaitlist(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);

  const childId = formData.get("childId");
  if (typeof childId !== "string" || !childId) return;

  const supabase = await createClient();

  // RLS blocks rather than errors, so a blocked update returns zero rows --
  // same reasoning as enrollFromWaitlist above and voidCharge in
  // billing/actions.ts. This action has no useActionState return channel
  // today (it's wired as a plain <form action={...}>), so a blocked write
  // (stale childId, cross-tenant, deleted child) has nothing to surface a
  // message through; the fix here is only to stop revalidating paths for a
  // write that never landed, not to invent a new signature.
  const { data, error } = await supabase
    .from("children")
    .update({ status: "waitlisted", waitlisted_at: todayISO() })
    .eq("id", childId)
    .eq("tenant_id", session.profile.tenantId)
    .select("id")
    .maybeSingle();

  if (error || !data) return;

  revalidatePath("/waitlist");
  revalidatePath("/children");
  revalidatePath(`/children/${childId}`);
}
