"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canManageAccident } from "@/lib/accidents/model";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { AccidentStatus, ParentNotifyMethod } from "@/types/database.types";

export type AccidentActionState = { message?: string; ok?: boolean } | undefined;

const METHODS: ParentNotifyMethod[] = ["phone", "in_person", "message"];
const STATUSES: AccidentStatus[] = ["open", "reviewed", "closed"];

export async function fileAccidentReport(
  _prev: AccidentActionState,
  formData: FormData,
): Promise<AccidentActionState> {
  const session = await verifySession();
  const parsed = parseFields(formData);
  if ("message" in parsed) return parsed;

  const supabase = await createClient();
  const child = await childAtCampus(parsed.childId, parsed.locationId, session.profile.tenantId);
  if (!child) return { message: "That child is not enrolled at this campus." };

  const { data, error } = await supabase
    .from("accident_reports")
    .insert({
      tenant_id: session.profile.tenantId,
      location_id: parsed.locationId,
      child_id: parsed.childId,
      filed_by: session.profile.id,
      status: "open",
      ...parsed.fields,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[accidents] file failed", error?.message);
    return { message: "That report could not be filed. Please try again." };
  }

  revalidatePath("/accidents");
  revalidatePath(`/children/${parsed.childId}`);
  redirect(`/accidents/${data.id}`);
}

export async function updateAccidentReport(
  _prev: AccidentActionState,
  formData: FormData,
): Promise<AccidentActionState> {
  const session = await verifySession();
  if (!canManageAccident(session.profile.role, session.profile.isSiteLead)) {
    return { message: "A director or site lead closes and corrects accident reports." };
  }

  const reportId = text(formData, "reportId");
  const status = parseStatus(text(formData, "status"));
  const parsed = parseFields(formData);
  if (!reportId) return { message: "Missing report." };
  if (!status) return { message: "Choose a status." };
  if ("message" in parsed) return parsed;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("accident_reports")
    .select("id, child_id, reviewed_at, closed_at")
    .eq("id", reportId)
    .eq("tenant_id", session.profile.tenantId)
    .maybeSingle();

  if (!existing) return { message: "That report could not be found." };

  const child = await childAtCampus(parsed.childId, parsed.locationId, session.profile.tenantId);
  if (!child) return { message: "That child is not enrolled at this campus." };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("accident_reports")
    .update({
      location_id: parsed.locationId,
      child_id: parsed.childId,
      status,
      ...parsed.fields,
      ...((status === "reviewed" || status === "closed") && !existing.reviewed_at
        ? { reviewed_by: session.profile.id, reviewed_at: now }
        : {}),
      ...(status === "closed" && !existing.closed_at
        ? { closed_by: session.profile.id, closed_at: now }
        : {}),
    })
    .eq("id", reportId)
    .eq("tenant_id", session.profile.tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[accidents] update failed", error.message);
    return { message: "That report could not be saved. Please try again." };
  }
  if (!data) return { message: "That report could not be updated." };

  revalidatePath("/accidents");
  revalidatePath(`/accidents/${reportId}`);
  revalidatePath(`/children/${existing.child_id}`);
  revalidatePath(`/children/${parsed.childId}`);
  return { ok: true, message: "Report saved." };
}

function parseFields(formData: FormData): { message: string } | { childId: string; locationId: string; fields: Fields } {
  const childId = text(formData, "childId");
  const locationId = text(formData, "locationId");
  const occurredOn = text(formData, "occurredOn");
  const occurredTime = text(formData, "occurredTime");
  const place = text(formData, "place");
  const whatHappened = text(formData, "whatHappened");
  const injuryType = text(formData, "injuryType");
  const bodyPart = text(formData, "bodyPart");
  const firstAid = text(formData, "firstAid");
  const staffPresent = text(formData, "staffPresent");
  const witnesses = text(formData, "witnesses");
  const parentNotified = formData.get("parentNotified") === "on";
  const oolReportable = formData.get("oolReportable") === "on";
  const signatureName = text(formData, "parentSignatureName");
  const signedOn = text(formData, "parentSignedOn");

  if (!childId || !locationId) return { message: "Choose the campus and the child." };
  if (!occurredOn || !occurredTime) return { message: "Enter the date and time." };
  if (!place) return { message: "Enter where it happened." };
  if (!whatHappened) return { message: "Describe what happened." };
  if (!injuryType || !bodyPart) return { message: "Enter the injury type and the body part." };
  if (!firstAid) return { message: "Enter the first aid given." };
  if (!staffPresent) return { message: "Enter the staff who were there." };

  let parentNotifiedOn: string | null = null;
  let parentNotifiedTime: string | null = null;
  let parentNotifyMethod: ParentNotifyMethod | null = null;
  let parentNotifiedBy: string | null = null;
  if (parentNotified) {
    parentNotifiedOn = text(formData, "parentNotifiedOn");
    parentNotifiedTime = text(formData, "parentNotifiedTime");
    parentNotifyMethod = METHODS.find((method) => method === text(formData, "parentNotifyMethod")) ?? null;
    parentNotifiedBy = text(formData, "parentNotifiedBy");
    if (!parentNotifiedOn || !parentNotifiedTime || !parentNotifyMethod || !parentNotifiedBy) {
      return { message: "Parent notification needs when, how, and by whom." };
    }
  }

  if (signatureName && !signedOn) return { message: "Enter the date the parent signed." };
  if (signedOn && !signatureName) return { message: "Enter the name the parent signed." };

  return {
    childId,
    locationId,
    fields: {
      occurred_on: occurredOn,
      occurred_time: occurredTime,
      place,
      what_happened: whatHappened,
      injury_type: injuryType,
      body_part: bodyPart,
      first_aid: firstAid,
      staff_present: staffPresent,
      witnesses,
      parent_notified: parentNotified,
      parent_notified_on: parentNotifiedOn,
      parent_notified_time: parentNotifiedTime,
      parent_notify_method: parentNotifyMethod,
      parent_notified_by: parentNotifiedBy,
      ool_reportable: oolReportable,
      parent_signature_name: signatureName,
      parent_signed_on: signatureName ? signedOn : null,
    },
  };
}

type Fields = {
  occurred_on: string;
  occurred_time: string;
  place: string;
  what_happened: string;
  injury_type: string;
  body_part: string;
  first_aid: string;
  staff_present: string;
  witnesses: string | null;
  parent_notified: boolean;
  parent_notified_on: string | null;
  parent_notified_time: string | null;
  parent_notify_method: ParentNotifyMethod | null;
  parent_notified_by: string | null;
  ool_reportable: boolean;
  parent_signature_name: string | null;
  parent_signed_on: string | null;
};

async function childAtCampus(childId: string, locationId: string, tenantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("child_people")
    .select("child_id")
    .eq("child_id", childId)
    .eq("location_id", locationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

function parseStatus(value: string | null): AccidentStatus | null {
  return STATUSES.find((status) => status === value) ?? null;
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
