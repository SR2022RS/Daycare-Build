import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_RESET,
  DEFAULT_SCHOOL_YEAR_DAY,
  DEFAULT_SCHOOL_YEAR_MONTH,
  inWindow,
  windowStart,
  type UniformReset,
} from "@/lib/uniforms/steps";
import type { Database, UniformStep } from "@/types/database.types";

type Db = SupabaseClient<Database>;

export interface UniformSettingsView {
  resetMode: UniformReset;
  startMonth: number;
  startDay: number;
}

export interface UniformRow {
  id: string;
  childId: string;
  childName: string;
  locationId: string;
  locationName: string;
  occurredOn: string;
  missingItem: string;
  note: string | null;
  step: UniformStep;
  feeDue: boolean;
  filedByName: string;
}

const DEFAULT_SETTINGS: UniformSettingsView = {
  resetMode: DEFAULT_RESET,
  startMonth: DEFAULT_SCHOOL_YEAR_MONTH,
  startDay: DEFAULT_SCHOOL_YEAR_DAY,
};

export async function loadUniformSettings(supabase: Db, tenantId: string): Promise<UniformSettingsView> {
  const { data, error } = await supabase
    .from("uniform_settings")
    .select("reset_mode, school_year_start_month, school_year_start_day")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[uniforms] settings read failed", error.message);
    return DEFAULT_SETTINGS;
  }

  return {
    resetMode: data.reset_mode,
    startMonth: data.school_year_start_month,
    startDay: data.school_year_start_day,
  };
}

export async function loadUniformWarnings(
  supabase: Db,
  tenantId: string,
): Promise<{ ok: true; rows: UniformRow[] } | { ok: false }> {
  const { data, error } = await supabase
    .from("uniform_warnings")
    .select(
      "id, child_id, location_id, occurred_on, missing_item, note, step, fee_due, staff_name, locations(name)",
    )
    .eq("tenant_id", tenantId)
    .order("occurred_on", { ascending: false });

  if (error) {
    console.error("[uniforms] list failed", error.message);
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
        childId: row.child_id,
        childName: names.get(row.child_id) ?? "Child",
        locationId: row.location_id,
        locationName: location?.name ?? "Campus",
        occurredOn: row.occurred_on,
        missingItem: row.missing_item,
        note: row.note,
        step: row.step,
        feeDue: row.fee_due,
        filedByName: row.staff_name,
      };
    }),
  };
}

export function countInWindow(rows: { occurredOn: string }[], settings: UniformSettingsView, onDate: string): number {
  const start = windowStart(settings.resetMode, onDate, settings.startMonth, settings.startDay);
  return rows.filter((row) => inWindow(row.occurredOn, start)).length;
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

export async function loadChildUniformHistory(
  supabase: Db,
  tenantId: string,
  childId: string,
): Promise<{ ok: true; rows: { id: string; occurredOn: string; missingItem: string; step: UniformStep; feeDue: boolean }[] } | { ok: false }> {
  const { data, error } = await supabase
    .from("uniform_warnings")
    .select("id, occurred_on, missing_item, step, fee_due")
    .eq("tenant_id", tenantId)
    .eq("child_id", childId)
    .order("occurred_on", { ascending: false });

  if (error) {
    console.error("[uniforms] child list failed", error.message);
    return { ok: false };
  }

  return {
    ok: true,
    rows: (data ?? []).map((row) => ({
      id: row.id,
      occurredOn: row.occurred_on,
      missingItem: row.missing_item,
      step: row.step,
      feeDue: row.fee_due,
    })),
  };
}
