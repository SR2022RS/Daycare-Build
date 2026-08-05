"use server";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export async function fileIncident(formData: FormData) {
  const session = await verifySession();
  const locationId = formData.get("locationId");
  const childName = formData.get("childName");
  const whatHappened = formData.get("whatHappened");
  const actionTaken = formData.get("actionTaken");

  if (
    typeof locationId !== "string" ||
    !locationId ||
    typeof childName !== "string" ||
    !childName.trim() ||
    typeof whatHappened !== "string" ||
    !whatHappened.trim() ||
    typeof actionTaken !== "string" ||
    !actionTaken.trim()
  ) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("incident_reports").insert({
    tenant_id: session.profile.tenantId,
    location_id: locationId,
    filed_by: session.profile.id,
    child_name: childName.trim(),
    what_happened: whatHappened.trim(),
    action_taken: actionTaken.trim(),
  });

  revalidatePath("/incidents");
}

// No app-layer role gate -- site lead is a flag, not a role, so eligibility
// (director/platform_admin, or site lead at the report's own location) is
// enforced entirely by incident_reports_update RLS. An unauthorized caller's
// update just matches zero rows.
export async function signIncident(formData: FormData) {
  const session = await verifySession();
  const incidentId = formData.get("incidentId");

  if (typeof incidentId !== "string" || !incidentId) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("incident_reports")
    .update({ status: "signed", signed_by: session.profile.id, signed_at: new Date().toISOString() })
    .eq("id", incidentId);

  revalidatePath("/incidents");
}

export async function markParentNotified(formData: FormData) {
  await verifySession();
  const incidentId = formData.get("incidentId");

  if (typeof incidentId !== "string" || !incidentId) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("incident_reports")
    .update({ status: "parent_notified", parent_notified_at: new Date().toISOString() })
    .eq("id", incidentId);

  revalidatePath("/incidents");
}
