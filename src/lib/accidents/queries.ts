import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccidentDetail } from "@/components/accidents/accident-editor";
import type { AccidentRow } from "@/components/accidents/accident-list";
import type { ChildAccidentLink } from "@/components/accidents/child-accidents";
import type { Database } from "@/types/database.types";

type Db = SupabaseClient<Database>;

const LIST_COLUMNS =
  "id, child_id, location_id, occurred_on, occurred_time, injury_type, body_part, status, parent_notified, ool_reportable, locations(name)";

export async function loadAccidentRows(
  supabase: Db,
  tenantId: string,
): Promise<{ ok: true; rows: AccidentRow[] } | { ok: false }> {
  const { data, error } = await supabase
    .from("accident_reports")
    .select(LIST_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("occurred_on", { ascending: false })
    .order("occurred_time", { ascending: false });

  if (error) {
    console.error("[accidents] list failed", error.message);
    return { ok: false };
  }

  const names = await childNames(
    supabase,
    tenantId,
    (data ?? []).map((row) => row.child_id),
  );

  return {
    ok: true,
    rows: (data ?? []).map((row) => {
      const location = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      return {
        id: row.id,
        childName: names.get(row.child_id) ?? "Child",
        locationId: row.location_id,
        locationName: location?.name ?? "Campus",
        occurredOn: row.occurred_on,
        occurredTime: row.occurred_time,
        injuryType: row.injury_type,
        bodyPart: row.body_part,
        status: row.status,
        parentNotified: row.parent_notified,
        oolReportable: row.ool_reportable,
      };
    }),
  };
}

export async function loadChildAccidents(
  supabase: Db,
  tenantId: string,
  childId: string,
): Promise<{ ok: true; reports: ChildAccidentLink[] } | { ok: false }> {
  const { data, error } = await supabase
    .from("accident_reports")
    .select("id, occurred_on, occurred_time, injury_type, body_part, status, parent_notified")
    .eq("tenant_id", tenantId)
    .eq("child_id", childId)
    .order("occurred_on", { ascending: false });

  if (error) {
    console.error("[accidents] child list failed", error.message);
    return { ok: false };
  }

  return {
    ok: true,
    reports: (data ?? []).map((row) => ({
      id: row.id,
      occurredOn: row.occurred_on,
      occurredTime: row.occurred_time,
      injuryType: row.injury_type,
      bodyPart: row.body_part,
      status: row.status,
      parentNotified: row.parent_notified,
    })),
  };
}

export async function loadAccident(
  supabase: Db,
  tenantId: string,
  reportId: string,
): Promise<AccidentDetail | null> {
  const { data, error } = await supabase
    .from("accident_reports")
    .select(
      "id, child_id, location_id, filed_by, occurred_on, occurred_time, place, what_happened, injury_type, body_part, first_aid, staff_present, witnesses, parent_notified, parent_notified_on, parent_notified_time, parent_notify_method, parent_notified_by, ool_reportable, parent_signature_name, parent_signed_on, status, locations(name), reporter:profiles!accident_reports_filed_by_fkey(full_name)",
    )
    .eq("id", reportId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[accidents] read failed", error.message);
    return null;
  }

  const names = await childNames(supabase, tenantId, [data.child_id]);
  const location = Array.isArray(data.locations) ? data.locations[0] : data.locations;
  const reporter = Array.isArray(data.reporter) ? data.reporter[0] : data.reporter;

  return {
    id: data.id,
    childId: data.child_id,
    childName: names.get(data.child_id) ?? "Child",
    locationId: data.location_id,
    locationName: location?.name ?? "Campus",
    occurredOn: data.occurred_on,
    occurredTime: data.occurred_time,
    place: data.place,
    whatHappened: data.what_happened,
    injuryType: data.injury_type,
    bodyPart: data.body_part,
    firstAid: data.first_aid,
    staffPresent: data.staff_present,
    witnesses: data.witnesses,
    parentNotified: data.parent_notified,
    parentNotifiedOn: data.parent_notified_on,
    parentNotifiedTime: data.parent_notified_time,
    parentNotifyMethod: data.parent_notify_method,
    parentNotifiedBy: data.parent_notified_by,
    oolReportable: data.ool_reportable,
    parentSignatureName: data.parent_signature_name,
    parentSignedOn: data.parent_signed_on,
    status: data.status,
    filedByName: reporter?.full_name ?? "Staff member",
  };
}

async function childNames(supabase: Db, tenantId: string, childIds: string[]) {
  const unique = [...new Set(childIds)];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabase
    .from("child_people")
    .select("child_id, full_name")
    .eq("tenant_id", tenantId)
    .in("child_id", unique);
  return new Map((data ?? []).map((row) => [row.child_id, row.full_name]));
}
