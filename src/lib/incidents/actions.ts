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

export type IncidentActionState = { message?: string } | undefined;

const CANT_SELF_UPDATE_MESSAGE = "You filed this report, so you can't update it yourself — ask another director or site lead.";

// No app-layer role gate -- site lead is a flag, not a role, so eligibility
// (director/platform_admin, or site lead at the report's own location) is
// enforced entirely by incident_reports_update RLS -- which also excludes
// the report's own filer (no self-certification). An update blocked by RLS
// isn't an error, just zero matched rows, so `.select().maybeSingle()`
// after the update is how we tell "blocked" apart from "succeeded" and
// surface that as a real message instead of the button silently doing
// nothing.
export async function signIncident(
  _state: IncidentActionState,
  formData: FormData,
): Promise<IncidentActionState> {
  const session = await verifySession();
  const incidentId = formData.get("incidentId");

  if (typeof incidentId !== "string" || !incidentId) {
    return;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incident_reports")
    .update({ status: "signed", signed_by: session.profile.id, signed_at: new Date().toISOString() })
    .eq("id", incidentId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { message: "Couldn't sign this report. Try again." };
  }
  if (!data) {
    return { message: CANT_SELF_UPDATE_MESSAGE };
  }

  revalidatePath("/incidents");
}

export async function markParentNotified(
  _state: IncidentActionState,
  formData: FormData,
): Promise<IncidentActionState> {
  await verifySession();
  const incidentId = formData.get("incidentId");

  if (typeof incidentId !== "string" || !incidentId) {
    return;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incident_reports")
    .update({ status: "parent_notified", parent_notified_at: new Date().toISOString() })
    .eq("id", incidentId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { message: "Couldn't update this report. Try again." };
  }
  if (!data) {
    return { message: CANT_SELF_UPDATE_MESSAGE };
  }

  revalidatePath("/incidents");
}
