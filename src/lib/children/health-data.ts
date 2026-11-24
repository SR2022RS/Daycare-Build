import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  compareAllergies,
  healthAlertsByChild,
  showsAllergyAlert,
  type ChildAllergyView,
  type ChildHealthView,
  type HealthAlert,
} from "@/lib/children/health-model";
import type { Database } from "@/types/database.types";

type Db = SupabaseClient<Database>;

export const EMPTY_CHILD_HEALTH: ChildHealthView = {
  hasAsthma: false,
  asthmaNotes: null,
  milkAlternative: null,
  dietaryRestrictions: null,
  healthNotes: null,
  allergyNotes: null,
  allergies: [],
};

export type ChildHealthLoad =
  | { status: "ok"; health: ChildHealthView }
  | { status: "unavailable" };

export type HealthAlertLoad =
  | { ok: true; alerts: Map<string, HealthAlert> }
  | { ok: false };

/**
 * A failed read must not look like "no allergies". Missing tables (migration
 * not applied yet) and any other error both come back unavailable.
 */
export async function loadChildHealth(
  supabase: Db,
  tenantId: string,
  childId: string,
): Promise<ChildHealthLoad> {
  const [{ data: profile, error: profileError }, { data: allergies, error: allergyError }] =
    await Promise.all([
      supabase
        .from("child_health")
        .select(
          "has_asthma, asthma_notes, milk_alternative, dietary_restrictions, health_notes, allergy_notes",
        )
        .eq("tenant_id", tenantId)
        .eq("child_id", childId)
        .maybeSingle(),
      supabase
        .from("child_allergies")
        .select("id, allergen, severity, reaction, action_plan")
        .eq("tenant_id", tenantId)
        .eq("child_id", childId),
    ]);

  if (profileError || allergyError) {
    console.error(
      "[children] health read failed",
      profileError?.message ?? allergyError?.message,
    );
    return { status: "unavailable" };
  }

  const rows: ChildAllergyView[] = (allergies ?? []).map((row) => ({
    id: row.id,
    allergen: row.allergen,
    severity: row.severity,
    reaction: row.reaction,
    actionPlan: row.action_plan,
  }));
  rows.sort(compareAllergies);

  if (!profile && rows.length === 0) {
    return { status: "ok", health: EMPTY_CHILD_HEALTH };
  }

  return {
    status: "ok",
    health: {
      hasAsthma: profile?.has_asthma ?? false,
      asthmaNotes: profile?.asthma_notes ?? null,
      milkAlternative: profile?.milk_alternative ?? null,
      dietaryRestrictions: profile?.dietary_restrictions ?? null,
      healthNotes: profile?.health_notes ?? null,
      allergyNotes: profile?.allergy_notes ?? null,
      allergies: rows,
    },
  };
}

export function profileHasAllergy(health: ChildHealthView): boolean {
  return showsAllergyAlert({
    allergyCount: health.allergies.length,
    allergyNotes: health.allergyNotes,
  });
}

/**
 * Badge inputs for a roster. An empty id list does not touch the database,
 * so a page with nobody on it still renders when the migration is pending.
 */
export async function loadHealthAlerts(
  supabase: Db,
  tenantId: string,
  childIds: string[],
): Promise<HealthAlertLoad> {
  if (childIds.length === 0) return { ok: true, alerts: new Map() };

  const [{ data: allergies, error: allergyError }, { data: healthRows, error: healthError }] =
    await Promise.all([
      supabase
        .from("child_allergies")
        .select("child_id")
        .eq("tenant_id", tenantId)
        .in("child_id", childIds),
      supabase
        .from("child_health")
        .select("child_id, allergy_notes, has_asthma")
        .eq("tenant_id", tenantId)
        .in("child_id", childIds),
    ]);

  if (allergyError || healthError) {
    console.error(
      "[children] health alert read failed",
      allergyError?.message ?? healthError?.message,
    );
    return { ok: false };
  }

  return {
    ok: true,
    alerts: healthAlertsByChild(allergies ?? [], healthRows ?? []),
  };
}
