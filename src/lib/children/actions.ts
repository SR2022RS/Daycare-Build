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

/**
 * Who may enter people, as opposed to who may set money.
 *
 * Staff do the bulk of the typing -- children, parents, contacts, pickup
 * lists -- because expecting one director to load five campuses by hand is
 * how a portal stays empty. What they may NOT do is decide what a family
 * pays; that split is enforced again by a trigger in the database
 * (guard_child_money), so this is the convenience layer, not the lock.
 */
const PEOPLE_ROLES = ["director", "platform_admin", "staff"] as const;
const MONEY_ROLES = ["director", "platform_admin"] as const;

function canSetMoney(role: string): boolean {
  return (MONEY_ROLES as readonly string[]).includes(role);
}

/**
 * People go in through `staff_save_child`; money is layered on afterwards for
 * a director.
 *
 * One path for the people fields rather than one for staff and another for
 * directors: two implementations of "what a valid child looks like" drift,
 * and the one used less often is the one that rots. The RPC has no rate
 * parameter at all, so a rate cannot travel through it even by accident --
 * see 20260826090000_staff_data_entry.sql.
 */
async function savePeople(formData: FormData, childId: string | null): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("staff_save_child", {
    p_child_id: childId,
    p_full_name: str(formData, "fullName") ?? "",
    p_dob: str(formData, "dob") ?? "",
    p_location_id: str(formData, "locationId") ?? "",
    p_classroom: str(formData, "classroom"),
    p_status: (str(formData, "status") ?? "active") as ChildStatus,
    p_schedule: (str(formData, "schedule") ?? "full_time") as ChildSchedule,
    p_funding_type: (str(formData, "fundingType") ?? "private") as FundingType,
    p_start_date: str(formData, "startDate"),
    p_desired_start_date: str(formData, "desiredStartDate"),
    p_pickup_code_word: str(formData, "pickupCodeWord"),
    p_room_id: str(formData, "roomId"),
  });

  if (error) {
    console.error("[children] staff_save_child failed", error.message);
    return null;
  }
  return data;
}

/**
 * Rates, applied only for a director and only when the form actually carried
 * them. Written straight to the table because the RPC deliberately cannot.
 */
async function saveMoney(formData: FormData, childId: string, tenantId: string, role: string) {
  if (!canSetMoney(role)) return;

  const patch = {
    weekly_rate: num(formData, "weeklyRate"),
    subsidy_weekly_amount: num(formData, "subsidyWeeklyAmount"),
    rate_note: str(formData, "rateNote"),
    cadence: (str(formData, "cadence") ?? "weekly") as BillingCadence,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("children")
    .update(patch)
    .eq("id", childId)
    .eq("tenant_id", tenantId);

  if (error) console.error("[children] rate update failed", error.message);
}

export async function createChild(formData: FormData) {
  const session = await requireRole([...PEOPLE_ROLES]);

  if (!str(formData, "fullName") || !str(formData, "dob") || !str(formData, "locationId")) {
    return;
  }

  const childId = await savePeople(formData, null);
  if (!childId) return;

  await saveMoney(formData, childId, session.profile.tenantId, session.profile.role);

  revalidatePath("/children");
}

export async function updateChild(formData: FormData) {
  const session = await requireRole([...PEOPLE_ROLES]);
  const childId = str(formData, "childId");

  if (!childId || !str(formData, "fullName") || !str(formData, "dob") || !str(formData, "locationId")) {
    return;
  }

  const saved = await savePeople(formData, childId);
  if (!saved) return;

  await saveMoney(formData, childId, session.profile.tenantId, session.profile.role);

  revalidatePath(`/children/${childId}`);
  revalidatePath("/children");
}

/**
 * Adds a parent and links them to the child.
 *
 * The reuse rule -- match on email, then on the last 10 digits of the phone,
 * never on name -- lives inside `staff_link_guardian` rather than here, so it
 * holds for every caller rather than only this form.
 */
export async function addGuardian(formData: FormData) {
  await requireRole([...PEOPLE_ROLES]);
  const childId = str(formData, "childId");
  const fullName = str(formData, "fullName");

  if (!childId || !fullName) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_link_guardian", {
    p_child_id: childId,
    p_full_name: fullName,
    p_phone: str(formData, "phone"),
    p_email: str(formData, "email"),
    p_relationship: str(formData, "relationship"),
    p_is_payer: formData.get("isPayer") === "on",
  });

  if (error) {
    console.error("[children] staff_link_guardian failed", error.message);
    return;
  }

  revalidatePath(`/children/${childId}`);
}

export async function setGuardianPayer(formData: FormData) {
  await requireRole([...PEOPLE_ROLES]);
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
  await requireRole([...PEOPLE_ROLES]);
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

/**
 * `useActionState` variants, for the staff screens.
 *
 * The director pages post to plain `<form action={createChild}>` handlers that
 * return nothing, so a rejected date or a missing campus simply does nothing
 * and the form sits there looking broken. That is survivable for one director
 * who knows the system; it is not survivable for a teacher entering forty
 * families, so the staff surfaces get a real result to render.
 *
 * These delegate to the same savePeople path rather than reimplementing it --
 * two definitions of "a valid child" would drift.
 */
export type ChildFormState = { message?: string; ok?: boolean } | undefined;

export async function saveChildPeople(
  _state: ChildFormState,
  formData: FormData,
): Promise<ChildFormState> {
  const session = await requireRole([...PEOPLE_ROLES]);

  const childId = str(formData, "childId");
  const fullName = str(formData, "fullName");

  if (!fullName) return { message: "Enter the child's full name." };
  if (!str(formData, "dob")) return { message: "Enter a date of birth." };
  if (!str(formData, "locationId")) return { message: "Choose a campus." };

  const saved = await savePeople(formData, childId);
  if (!saved) {
    return { message: "That could not be saved. Check the fields and try again." };
  }

  await saveMoney(formData, saved, session.profile.tenantId, session.profile.role);

  revalidatePath("/children");
  if (childId) revalidatePath(`/children/${childId}`);

  return { ok: true, message: childId ? "Saved." : `${fullName} added.` };
}

export async function addGuardianWithFeedback(
  _state: ChildFormState,
  formData: FormData,
): Promise<ChildFormState> {
  await requireRole([...PEOPLE_ROLES]);

  const childId = str(formData, "childId");
  const fullName = str(formData, "fullName");

  if (!childId) return { message: "Missing child." };
  if (!fullName) return { message: "Enter the parent's name." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_link_guardian", {
    p_child_id: childId,
    p_full_name: fullName,
    p_phone: str(formData, "phone"),
    p_email: str(formData, "email"),
    p_relationship: str(formData, "relationship"),
    p_is_payer: formData.get("isPayer") === "on",
  });

  if (error) {
    console.error("[children] staff_link_guardian failed", error.message);
    return { message: "That parent could not be added. Please try again." };
  }

  revalidatePath(`/children/${childId}`);
  return { ok: true, message: `${fullName} added.` };
}
