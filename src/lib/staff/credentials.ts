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
