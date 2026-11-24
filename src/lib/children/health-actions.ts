"use server";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/auth/dal";
import { canEditChildHealth, ALLERGY_SEVERITIES } from "@/lib/children/health-model";
import { createClient } from "@/lib/supabase/server";
import type { AllergySeverity } from "@/types/database.types";

export type HealthActionState = { message?: string; ok?: boolean } | undefined;

export async function saveChildHealth(
  prevState: HealthActionState,
  formData: FormData,
): Promise<HealthActionState> {
  const session = await verifySession();
  if (!canEditChildHealth(session.profile.role, session.profile.isSiteLead)) {
    return { message: "You can view health details, but only a director or site lead can change them." };
  }

  const childId = text(formData, "childId");
  if (!childId) return { message: "Missing child." };
  if (!(await childInTenant(childId, session.profile.tenantId))) {
    return { message: "That child could not be found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("child_health").upsert(
    {
      child_id: childId,
      tenant_id: session.profile.tenantId,
      has_asthma: formData.get("hasAsthma") === "on",
      asthma_notes: text(formData, "asthmaNotes"),
      milk_alternative: text(formData, "milkAlternative"),
      dietary_restrictions: text(formData, "dietaryRestrictions"),
      health_notes: text(formData, "healthNotes"),
      allergy_notes: text(formData, "allergyNotes"),
    },
    { onConflict: "child_id" },
  );

  if (error) {
    console.error("[children] save health failed", error.message);
    return { message: "Health details could not be saved. Please try again." };
  }

  revalidateChild(childId);
  return { ok: true, message: "Health details saved." };
}

export async function addChildAllergy(
  prevState: HealthActionState,
  formData: FormData,
): Promise<HealthActionState> {
  const session = await verifySession();
  if (!canEditChildHealth(session.profile.role, session.profile.isSiteLead)) {
    return { message: "You can view allergies, but only a director or site lead can change them." };
  }

  const childId = text(formData, "childId");
  const allergen = text(formData, "allergen");
  const severity = parseSeverity(text(formData, "severity"));
  if (!childId) return { message: "Missing child." };
  if (!allergen) return { message: "Enter the allergen." };
  if (!severity) return { message: "Choose a severity." };
  if (!(await childInTenant(childId, session.profile.tenantId))) {
    return { message: "That child could not be found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("child_allergies").insert({
    tenant_id: session.profile.tenantId,
    child_id: childId,
    allergen,
    severity,
    reaction: text(formData, "reaction"),
    action_plan: text(formData, "actionPlan"),
  });

  if (error) {
    console.error("[children] add allergy failed", error.message);
    return { message: "That allergy could not be saved. Please try again." };
  }

  revalidateChild(childId);
  return { ok: true, message: `${allergen} added.` };
}

export async function removeChildAllergy(
  prevState: HealthActionState,
  formData: FormData,
): Promise<HealthActionState> {
  const session = await verifySession();
  if (!canEditChildHealth(session.profile.role, session.profile.isSiteLead)) {
    return { message: "You can view allergies, but only a director or site lead can change them." };
  }

  const childId = text(formData, "childId");
  const allergyId = text(formData, "allergyId");
  if (!childId || !allergyId) return { message: "Missing allergy." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("child_allergies")
    .delete()
    .eq("id", allergyId)
    .eq("tenant_id", session.profile.tenantId);

  if (error) {
    console.error("[children] remove allergy failed", error.message);
    return { message: "That allergy could not be removed." };
  }

  revalidateChild(childId);
  return { ok: true };
}

async function childInTenant(childId: string, tenantId: string): Promise<boolean> {
  const supabase = await createClient();
  // child_people, not children: staff (including site leads) cannot select
  // children, because that table carries rates. The view is the same people
  // row without the money.
  const { data } = await supabase
    .from("child_people")
    .select("child_id")
    .eq("child_id", childId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return Boolean(data);
}

function revalidateChild(childId: string) {
  revalidatePath("/children");
  revalidatePath(`/children/${childId}`);
  revalidatePath("/attendance/children");
  revalidatePath("/waitlist");
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseSeverity(value: string | null): AllergySeverity | null {
  return ALLERGY_SEVERITIES.find((severity) => severity === value) ?? null;
}
