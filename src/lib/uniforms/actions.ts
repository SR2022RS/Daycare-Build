"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { UniformReset } from "@/types/database.types";

export type UniformActionState = { message?: string; ok?: boolean } | undefined;

const RESETS: UniformReset[] = ["school_year", "calendar_year", "never"];

export async function fileUniformWarning(
  _prev: UniformActionState,
  formData: FormData,
): Promise<UniformActionState> {
  const session = await verifySession();
  const childId = text(formData, "childId");
  const locationId = text(formData, "locationId");
  const occurredOn = text(formData, "occurredOn");
  const missingItem = text(formData, "missingItem");
  const note = text(formData, "note");

  if (!childId || !locationId) return { message: "Choose the campus and the child." };
  if (!occurredOn) return { message: "Enter the date." };
  if (!missingItem) return { message: "Enter what was missing." };

  const supabase = await createClient();
  const { data: child } = await supabase
    .from("child_people")
    .select("child_id")
    .eq("child_id", childId)
    .eq("location_id", locationId)
    .eq("tenant_id", session.profile.tenantId)
    .maybeSingle();

  if (!child) return { message: "That child is not enrolled at this campus." };

  // step and fee_due are assigned by assign_uniform_step. Sending placeholders
  // keeps the insert valid if the column defaults are ever required by the client.
  const { data, error } = await supabase
    .from("uniform_warnings")
    .insert({
      tenant_id: session.profile.tenantId,
      location_id: locationId,
      child_id: childId,
      filed_by: session.profile.id,
      staff_name: session.profile.fullName,
      occurred_on: occurredOn,
      missing_item: missingItem,
      note,
      step: "verbal",
      fee_due: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[uniforms] file failed", error?.message);
    return { message: "That warning could not be saved. Please try again." };
  }

  revalidatePath("/uniforms");
  revalidatePath(`/children/${childId}`);
  redirect(`/uniforms/${data.id}`);
}

export async function saveUniformSettings(
  _prev: UniformActionState,
  formData: FormData,
): Promise<UniformActionState> {
  const session = await verifySession();
  if (session.profile.role === "staff") {
    return { message: "A director sets how the uniform count resets." };
  }

  const resetMode = RESETS.find((mode) => mode === text(formData, "resetMode"));
  const month = numberIn(formData, "startMonth", 1, 12);
  const day = numberIn(formData, "startDay", 1, 28);
  if (!resetMode) return { message: "Choose how the count resets." };
  if (resetMode === "school_year" && (month === null || day === null)) {
    return { message: "The school year needs a start month and day (1–28)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("uniform_settings").upsert(
    {
      tenant_id: session.profile.tenantId,
      reset_mode: resetMode,
      school_year_start_month: month ?? 9,
      school_year_start_day: day ?? 1,
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    console.error("[uniforms] settings failed", error.message);
    return { message: "That setting could not be saved." };
  }

  revalidatePath("/uniforms");
  revalidatePath("/children");
  return { ok: true, message: "Count reset saved." };
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberIn(formData: FormData, key: string, min: number, max: number): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}
