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
      room_id: str(formData, "roomId"),
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
