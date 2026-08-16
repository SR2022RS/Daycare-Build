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
