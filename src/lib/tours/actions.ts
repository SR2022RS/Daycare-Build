"use server";

import { revalidatePath } from "next/cache";

import { INTENSIVE } from "@/lib/intensive/config";
import { requireRole } from "@/lib/auth/dal";
import { getClientIp } from "@/lib/forms/access-log";
import { pushTourLeadToGhl } from "@/lib/tours/ghl-hook";
import { isHeardAbout, TOUR_STATUSES } from "@/lib/tours/labels";
import { isTourRateLimited } from "@/lib/tours/rate-limit";
import { honeypotTripped, plausibleEmail, plausiblePhone } from "@/lib/tours/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type TourActionState = { message?: string; ok?: boolean } | undefined;

export async function submitTourRequest(
  _prev: TourActionState,
  formData: FormData,
): Promise<TourActionState> {
  if (isTourRateLimited(await getClientIp())) {
    return { message: "Too many requests from this connection. Wait a few minutes and try again." };
  }

  // Pretend it worked so a bot is not told which field gave it away.
  if (honeypotTripped(formData.get("company_website"))) {
    return { ok: true };
  }

  const parentName = text(formData, "parentName");
  const phone = text(formData, "phone");
  const email = text(formData, "email")?.toLowerCase() ?? null;
  const childAges = text(formData, "childAges");
  const locationId = text(formData, "locationId");
  const desiredStart = text(formData, "desiredStart");
  const preferredTime = text(formData, "preferredTime");
  const heardAbout = text(formData, "heardAbout");
  const notes = text(formData, "notes");

  if (!parentName) return { message: "Enter your name." };
  if (!phone || !plausiblePhone(phone)) return { message: "Enter a phone number." };
  if (!email || !plausibleEmail(email)) return { message: "Enter an email address." };
  if (!childAges) return { message: "Enter your child's age, or ages." };
  if (!locationId) return { message: "Choose a campus." };
  if (heardAbout && !isHeardAbout(heardAbout)) {
    return { message: "Choose how you heard about us." };
  }

  const admin = createAdminClient();
  const { data: campus } = await admin
    .from("locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("tenant_id", INTENSIVE.tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!campus) return { message: "That campus is not open for tours." };

  const { data, error } = await admin
    .from("tour_requests")
    .insert({
      tenant_id: INTENSIVE.tenantId,
      location_id: campus.id,
      parent_name: parentName,
      phone,
      email,
      child_ages: childAges,
      desired_start: desiredStart,
      preferred_time: preferredTime,
      heard_about: heardAbout,
      notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[tours] insert failed", error?.message);
    return { message: "We couldn't save that request. Please call the center." };
  }

  try {
    await pushTourLeadToGhl({
      id: data.id,
      parentName,
      email,
      phone,
      campusName: campus.name,
    });
  } catch (hookError) {
    console.error("[tours] lead hook failed", hookError);
  }

  return { ok: true };
}

export async function updateTourRequest(
  _prev: TourActionState,
  formData: FormData,
): Promise<TourActionState> {
  const session = await requireRole(["director", "platform_admin"]);
  const requestId = text(formData, "requestId");
  const status = TOUR_STATUSES.find((value) => value === text(formData, "status"));
  const adminNotes = text(formData, "adminNotes");

  if (!requestId) return { message: "Missing request." };
  if (!status) return { message: "Choose a status." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tour_requests")
    .update({ status, admin_notes: adminNotes })
    .eq("id", requestId)
    .eq("tenant_id", session.profile.tenantId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[tours] update failed", error?.message);
    return { message: "That request could not be updated." };
  }

  revalidatePath("/tours");
  return { ok: true, message: "Saved." };
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
