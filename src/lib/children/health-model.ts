import type { AllergySeverity, AppRole } from "@/types/database.types";

export interface ChildAllergyView {
  id: string;
  allergen: string;
  severity: AllergySeverity;
  reaction: string | null;
  actionPlan: string | null;
}

export interface ChildHealthView {
  hasAsthma: boolean;
  asthmaNotes: string | null;
  milkAlternative: string | null;
  dietaryRestrictions: string | null;
  healthNotes: string | null;
  allergyNotes: string | null;
  allergies: ChildAllergyView[];
}

/**
 * Who may change a child's health record.
 *
 * Mirrors child_health_write / child_allergies_write: directors and
 * platform admins, plus site leads. A teacher (staff, not a site lead)
 * can read and cannot write. Job titles are not consulted.
 */
export function canEditChildHealth(role: AppRole, isSiteLead: boolean): boolean {
  return role === "platform_admin" || role === "director" || isSiteLead;
}

export interface HealthAlert {
  hasAllergy: boolean;
  hasAsthma: boolean;
}

/**
 * Roster flag. A free-text note counts even when nobody has split it into
 * allergen rows yet — that is how existing notes arrive.
 */
export function showsAllergyAlert(input: {
  allergyCount: number;
  allergyNotes: string | null | undefined;
}): boolean {
  return input.allergyCount > 0 || Boolean(input.allergyNotes?.trim());
}

export function healthAlertsByChild(
  allergies: { child_id: string }[],
  healthRows: { child_id: string; allergy_notes: string | null; has_asthma: boolean }[],
): Map<string, HealthAlert> {
  const map = new Map<string, HealthAlert>();

  const ensure = (childId: string): HealthAlert => {
    const existing = map.get(childId);
    if (existing) return existing;
    const created: HealthAlert = { hasAllergy: false, hasAsthma: false };
    map.set(childId, created);
    return created;
  };

  for (const row of allergies) {
    ensure(row.child_id).hasAllergy = true;
  }

  for (const row of healthRows) {
    const alert = ensure(row.child_id);
    if (row.allergy_notes?.trim()) alert.hasAllergy = true;
    if (row.has_asthma) alert.hasAsthma = true;
  }

  return map;
}

const SEVERITY_RANK: Record<AllergySeverity, number> = {
  life_threatening: 0,
  severe: 1,
  moderate: 2,
  mild: 3,
};

export const ALLERGY_SEVERITIES: AllergySeverity[] = [
  "life_threatening",
  "severe",
  "moderate",
  "mild",
];

export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, string> = {
  life_threatening: "Life-threatening",
  severe: "Severe",
  moderate: "Moderate",
  mild: "Mild",
};

/** Life-threatening first, then by allergen name, so the roster-critical ones lead. */
export function compareAllergies(
  a: { severity: AllergySeverity; allergen: string },
  b: { severity: AllergySeverity; allergen: string },
): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  return a.allergen.localeCompare(b.allergen);
}
