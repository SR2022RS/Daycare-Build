import type { SupabaseClient } from "@supabase/supabase-js";

import type { CredentialType, Database } from "@/types/database.types";

// Display logic only -- not an enforced lockout. A staffer failing this
// check still shows up everywhere; only the "Not cleared for solo
// supervision" badge/tile changes.
const SUPERVISION_GATE_CREDENTIALS: CredentialType[] = [
  "orientation_new_hire",
  "cari",
  "chri",
];

export type ClearanceMap = Record<string, boolean>;

export const CREDENTIAL_LABELS: Record<CredentialType, string> = {
  cari: "CARI (Child Abuse Record Information)",
  chri: "CHRI (Criminal History / Fingerprint)",
  mantoux: "Mantoux (TB) Test",
  medical_exam: "Medical Exam",
  orientation_new_hire: "New Hire Orientation",
  orientation_annual: "Annual Orientation Refresher",
  understanding_licensing: "Understanding Licensing",
};

/**
 * Codes for dense UI. The full labels are correct on a staff record, but
 * repeating "CARI (Child Abuse Record Information), CHRI (Criminal History /
 * Fingerprint)" once per row turns a roster into a wall of identical text.
 */
export const CREDENTIAL_SHORT_LABELS: Record<CredentialType, string> = {
  cari: "CARI",
  chri: "CHRI",
  mantoux: "Mantoux",
  medical_exam: "Medical exam",
  orientation_new_hire: "Orientation",
  orientation_annual: "Annual refresher",
  understanding_licensing: "Licensing",
};

export const ALL_CREDENTIAL_TYPES: CredentialType[] = [
  "orientation_new_hire",
  "cari",
  "chri",
  "orientation_annual",
  "understanding_licensing",
  "mantoux",
  "medical_exam",
];

export async function getSupervisionClearanceMap(
  supabase: SupabaseClient<Database>,
  staffIds: string[],
): Promise<ClearanceMap> {
  if (staffIds.length === 0) return {};

  const { data } = await supabase
    .from("staff_credentials")
    .select("staff_id, credential_type, date_cleared")
    .in("staff_id", staffIds)
    .in("credential_type", SUPERVISION_GATE_CREDENTIALS);

  const clearedByStaff = new Map<string, Set<CredentialType>>();
  for (const row of data ?? []) {
    if (!row.date_cleared) continue;
    if (!clearedByStaff.has(row.staff_id)) clearedByStaff.set(row.staff_id, new Set());
    clearedByStaff.get(row.staff_id)!.add(row.credential_type);
  }

  const result: ClearanceMap = {};
  for (const id of staffIds) {
    const cleared = clearedByStaff.get(id);
    result[id] = SUPERVISION_GATE_CREDENTIALS.every((c) => cleared?.has(c));
  }
  return result;
}

export type ClearedCountMap = Record<string, number>;

export async function getClearedCountMap(
  supabase: SupabaseClient<Database>,
  staffIds: string[],
): Promise<ClearedCountMap> {
  if (staffIds.length === 0) return {};

  const { data } = await supabase
    .from("staff_credentials")
    .select("staff_id, date_cleared")
    .in("staff_id", staffIds)
    .not("date_cleared", "is", null);

  const result: ClearedCountMap = {};
  for (const id of staffIds) result[id] = 0;
  for (const row of data ?? []) {
    result[row.staff_id] = (result[row.staff_id] ?? 0) + 1;
  }
  return result;
}

export interface NotClearedEntry {
  staffId: string;
  name: string;
  role: string;
  missing: string[];
}

export async function getNotClearedList(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<NotClearedEntry[]> {
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, title")
    .eq("tenant_id", tenantId)
    .eq("role", "staff")
    .order("full_name");

  const staffIds = (staff ?? []).map((s) => s.id);
  if (staffIds.length === 0) return [];

  const { data } = await supabase
    .from("staff_credentials")
    .select("staff_id, credential_type, date_cleared")
    .in("staff_id", staffIds)
    .in("credential_type", SUPERVISION_GATE_CREDENTIALS);

  const clearedByStaff = new Map<string, Set<CredentialType>>();
  for (const row of data ?? []) {
    if (!row.date_cleared) continue;
    if (!clearedByStaff.has(row.staff_id)) clearedByStaff.set(row.staff_id, new Set());
    clearedByStaff.get(row.staff_id)!.add(row.credential_type);
  }

  return (staff ?? [])
    .map((s) => {
      const cleared = clearedByStaff.get(s.id);
      const missing = SUPERVISION_GATE_CREDENTIALS.filter((c) => !cleared?.has(c)).map(
        (c) => CREDENTIAL_LABELS[c],
      );
      return { staffId: s.id, name: s.full_name, role: s.title || "Staff", missing };
    })
    .filter((entry) => entry.missing.length > 0);
}

export interface ExpiringCredentialEntry {
  staffId: string;
  name: string;
  credential: string;
  expiresAt: string;
  daysUntil: number;
}

export async function getExpiringCredentialsList(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  withinDays: number,
): Promise<ExpiringCredentialEntry[]> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const future = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("staff_credentials")
    .select("staff_id, credential_type, expires_at, profiles(full_name)")
    .eq("tenant_id", tenantId)
    .not("expires_at", "is", null)
    .gte("expires_at", today)
    .lte("expires_at", future)
    .order("expires_at");

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const expiresAt = row.expires_at as string;
    const daysUntil = Math.round(
      (new Date(expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    return {
      staffId: row.staff_id,
      name: profile?.full_name ?? "Unknown",
      credential: CREDENTIAL_LABELS[row.credential_type],
      expiresAt,
      daysUntil,
    };
  });
}

export interface ClearanceRollup {
  /** Staff on the supervision gate (role = 'staff'). */
  total: number;
  clearedCount: number;
  /** One row per gating credential, with how many staff still lack it. */
  perCredential: { type: CredentialType; label: string; missingCount: number }[];
  /**
   * Staff grouped by the exact set of credentials they are missing. 27 people
   * missing the same three is one row, not 27 identical ones.
   */
  groups: { key: string; missing: CredentialType[]; staff: { id: string; name: string }[] }[];
  /** Nearly-cleared staff, most complete first -- the actionable slice. */
  closest: { id: string; name: string; clearedOf: number; total: number }[];
}

/**
 * Everything the dashboard needs about solo-supervision readiness, in one
 * pass.
 *
 * `getNotClearedList` answers "who is not cleared", which produced a page
 * listing every uncleared staffer beside the same 95-character credential
 * string. A director cannot act on that. This answers the questions they
 * actually have: how far off are we, which credential is the bottleneck, and
 * who is closest to clearing.
 */
export async function getClearanceRollup(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<ClearanceRollup> {
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .eq("role", "staff")
    .order("full_name");

  const roster = staff ?? [];
  const empty: ClearanceRollup = {
    total: 0,
    clearedCount: 0,
    perCredential: SUPERVISION_GATE_CREDENTIALS.map((type) => ({
      type,
      label: CREDENTIAL_SHORT_LABELS[type],
      missingCount: 0,
    })),
    groups: [],
    closest: [],
  };
  if (roster.length === 0) return empty;

  const staffIds = roster.map((s) => s.id);

  const [{ data: gateRows }, clearedCounts] = await Promise.all([
    supabase
      .from("staff_credentials")
      .select("staff_id, credential_type, date_cleared")
      .in("staff_id", staffIds)
      .in("credential_type", SUPERVISION_GATE_CREDENTIALS),
    getClearedCountMap(supabase, staffIds),
  ]);

  const clearedByStaff = new Map<string, Set<CredentialType>>();
  for (const row of gateRows ?? []) {
    if (!row.date_cleared) continue;
    if (!clearedByStaff.has(row.staff_id)) clearedByStaff.set(row.staff_id, new Set());
    clearedByStaff.get(row.staff_id)!.add(row.credential_type);
  }

  const missingCounts = new Map<CredentialType, number>(
    SUPERVISION_GATE_CREDENTIALS.map((type) => [type, 0]),
  );
  const groupMap = new Map<string, { missing: CredentialType[]; staff: { id: string; name: string }[] }>();
  let clearedCount = 0;

  for (const person of roster) {
    const cleared = clearedByStaff.get(person.id);
    const missing = SUPERVISION_GATE_CREDENTIALS.filter((c) => !cleared?.has(c));

    if (missing.length === 0) {
      clearedCount += 1;
      continue;
    }

    for (const type of missing) {
      missingCounts.set(type, (missingCounts.get(type) ?? 0) + 1);
    }

    // Order is fixed by SUPERVISION_GATE_CREDENTIALS, so the same gap always
    // produces the same key regardless of row order from the database.
    const key = missing.join("+");
    if (!groupMap.has(key)) groupMap.set(key, { missing, staff: [] });
    groupMap.get(key)!.staff.push({ id: person.id, name: person.full_name });
  }

  const groups = [...groupMap.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.staff.length - a.staff.length);

  const closest = roster
    .filter((person) => (clearedByStaff.get(person.id)?.size ?? 0) < SUPERVISION_GATE_CREDENTIALS.length)
    .map((person) => ({
      id: person.id,
      name: person.full_name,
      clearedOf: clearedCounts[person.id] ?? 0,
      total: ALL_CREDENTIAL_TYPES.length,
    }))
    // Most complete first: these are the people one document away from
    // clearing, so they are where a director's next hour pays off.
    .sort((a, b) => b.clearedOf - a.clearedOf)
    .slice(0, 5);

  return {
    total: roster.length,
    clearedCount,
    perCredential: SUPERVISION_GATE_CREDENTIALS.map((type) => ({
      type,
      label: CREDENTIAL_SHORT_LABELS[type],
      missingCount: missingCounts.get(type) ?? 0,
    })),
    groups,
    closest,
  };
}
