"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { BillingCadence, ChildSchedule, ChildStatus, FundingType } from "@/types/database.types";

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(formData: FormData, key: string): number | null {
  const value = str(formData, key);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createChild(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const fullName = str(formData, "fullName");
  const dob = str(formData, "dob");
  const locationId = str(formData, "locationId");

  if (!fullName || !dob || !locationId) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("children").insert({
    tenant_id: session.profile.tenantId,
    location_id: locationId,
    full_name: fullName,
    dob,
    classroom: str(formData, "classroom"),
    status: (str(formData, "status") ?? "active") as ChildStatus,
    funding_type: (str(formData, "fundingType") ?? "private") as FundingType,
    schedule: (str(formData, "schedule") ?? "full_time") as ChildSchedule,
    weekly_rate: num(formData, "weeklyRate"),
    rate_note: str(formData, "rateNote"),
    cadence: (str(formData, "cadence") ?? "weekly") as BillingCadence,
    start_date: str(formData, "startDate"),
  });

  revalidatePath("/children");
}

export async function updateChild(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const childId = str(formData, "childId");
  const fullName = str(formData, "fullName");
  const dob = str(formData, "dob");
  const locationId = str(formData, "locationId");

  if (!childId || !fullName || !dob || !locationId) {
    return;
  }

  const supabase = await createClient();

  const roomId = str(formData, "roomId");
  if (roomId) {
    // roomId arrives from a hidden/select form field, so it must be
    // verified to belong to this director's own tenant before writing it
    // onto the child -- the room_id FK has no tenancy check of its own, so
    // a crafted POST could otherwise point a child at another tenant's
    // room. Mirrors the invoiceId ownership check in recordPayment
    // (src/lib/billing/actions.ts).
    const { data: room } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", roomId)
      .eq("tenant_id", session.profile.tenantId)
      .maybeSingle();

    if (!room) return;
  }

  await supabase
    .from("children")
    .update({
      location_id: locationId,
      full_name: fullName,
      dob,
      classroom: str(formData, "classroom"),
      status: (str(formData, "status") ?? "active") as ChildStatus,
      funding_type: (str(formData, "fundingType") ?? "private") as FundingType,
      schedule: (str(formData, "schedule") ?? "full_time") as ChildSchedule,
      weekly_rate: num(formData, "weeklyRate"),
      subsidy_weekly_amount: num(formData, "subsidyWeeklyAmount"),
      rate_note: str(formData, "rateNote"),
      cadence: (str(formData, "cadence") ?? "weekly") as BillingCadence,
      start_date: str(formData, "startDate"),
      room_id: roomId,
      waitlisted_at: str(formData, "waitlistedAt"),
      desired_start_date: str(formData, "desiredStartDate"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", childId)
    .eq("tenant_id", session.profile.tenantId);

  revalidatePath(`/children/${childId}`);
  revalidatePath("/children");
}

export async function addGuardian(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const childId = str(formData, "childId");
  const fullName = str(formData, "fullName");

  if (!childId || !fullName) {
    return;
  }

  const supabase = await createClient();
  const { data: guardian, error } = await supabase
    .from("guardians")
    .insert({
      tenant_id: session.profile.tenantId,
      full_name: fullName,
      phone: str(formData, "phone"),
      email: str(formData, "email"),
    })
    .select("id")
    .single();

  if (error || !guardian) {
    return;
  }

  await supabase.from("child_guardians").insert({
    child_id: childId,
    guardian_id: guardian.id,
    relationship: str(formData, "relationship"),
    is_payer: formData.get("isPayer") === "on",
  });

  revalidatePath(`/children/${childId}`);
}

export async function setGuardianPayer(formData: FormData) {
  await requireRole(["director", "platform_admin"]);
  const childId = str(formData, "childId");
  const guardianId = str(formData, "guardianId");

  if (!childId || !guardianId) {
    return;
  }

  const supabase = await createClient();
  // Only one payer per child in this minimal model -- clear the others first.
  await supabase.from("child_guardians").update({ is_payer: false }).eq("child_id", childId);
  await supabase
    .from("child_guardians")
    .update({ is_payer: true })
    .eq("child_id", childId)
    .eq("guardian_id", guardianId);

  revalidatePath(`/children/${childId}`);
}

export async function removeGuardian(formData: FormData) {
  await requireRole(["director", "platform_admin"]);
  const childId = str(formData, "childId");
  const guardianId = str(formData, "guardianId");

  if (!childId || !guardianId) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("child_guardians").delete().eq("child_id", childId).eq("guardian_id", guardianId);

  revalidatePath(`/children/${childId}`);
}

/**
 * Issue or reset a guardian's kiosk PIN.
 *
 * Deliberately mirrors `resetStaffPin` in `src/lib/kiosk/actions.ts`,
 * including the `useActionState` signature: the plaintext PIN exists only
 * inside this function and the one render that displays it, so it has to
 * come back through the action's return value rather than being stored.
 * `admin_set_guardian_pin` only ever receives it to hash.
 *
 * The retry loop exists because the RPC enforces tenant-wide PIN uniqueness
 * (the kiosk identifies a guardian by PIN alone, with no username), so a
 * randomly generated candidate can legitimately collide. Five attempts
 * against a 9000-value space makes an exhausted loop a real signal that the
 * tenant is running out of PINs, not a transient failure.
 *
 * A guardian PIN is kiosk-only and never grants portal access, exactly as
 * the staff PIN is.
 */
export async function resetGuardianPin(
  _state: { message?: string; pin?: string } | undefined,
  formData: FormData,
): Promise<{ message?: string; pin?: string }> {
  await requireRole(["director", "platform_admin"]);
  const guardianId = str(formData, "guardianId");
  if (!guardianId) {
    return { message: "Missing guardian." };
  }

  const supabase = await createClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = String(Math.floor(1000 + Math.random() * 9000));
    const { error } = await supabase.rpc("admin_set_guardian_pin", {
      p_guardian_id: guardianId,
      p_pin: candidate,
    });
    if (!error) {
      return { pin: candidate };
    }
    if (!error.message.includes("pin_taken")) {
      return { message: "Couldn't set a PIN. Try again." };
    }
  }

  return { message: "Couldn't find a free PIN. Try again." };
}
