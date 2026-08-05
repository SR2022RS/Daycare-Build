import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ALL_CREDENTIAL_TYPES, getClearedCountMap, getSupervisionClearanceMap } from "@/lib/staff/credentials";
import { StaffDirectoryTable, type StaffRow } from "@/components/staff/staff-directory-table";

export default async function StaffPage() {
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const [{ data: staff }, { count: moduleCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, title")
      .eq("tenant_id", session.profile.tenantId)
      .order("full_name"),
    supabase
      .from("training_modules")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.profile.tenantId),
  ]);

  const staffIds = (staff ?? []).map((s) => s.id);
  const staffOnlyIds = (staff ?? []).filter((s) => s.role === "staff").map((s) => s.id);
  const totalModules = moduleCount ?? 0;

  const [{ data: locationRows }, { data: progressRows }, clearedCountMap, clearanceMap] =
    await Promise.all([
      staffIds.length
        ? supabase.from("staff_locations").select("staff_id, locations(name)").in("staff_id", staffIds)
        : Promise.resolve({ data: [] as { staff_id: string; locations: { name: string } | null }[] }),
      staffIds.length
        ? supabase.from("staff_training_progress").select("staff_id, status").in("staff_id", staffIds)
        : Promise.resolve({ data: [] as { staff_id: string; status: string }[] }),
      getClearedCountMap(supabase, staffIds),
      getSupervisionClearanceMap(supabase, staffOnlyIds),
    ]);

  const locationsByStaff = new Map<string, string[]>();
  for (const row of locationRows ?? []) {
    const name = row.locations?.name;
    if (!name) continue;
    if (!locationsByStaff.has(row.staff_id)) locationsByStaff.set(row.staff_id, []);
    locationsByStaff.get(row.staff_id)!.push(name);
  }

  const completedByStaff = new Map<string, number>();
  for (const row of progressRows ?? []) {
    if (row.status !== "completed") continue;
    completedByStaff.set(row.staff_id, (completedByStaff.get(row.staff_id) ?? 0) + 1);
  }

  const allCenters = Array.from(new Set(Array.from(locationsByStaff.values()).flat())).sort();

  const rows: StaffRow[] = (staff ?? []).map((s) => {
    const locs = locationsByStaff.get(s.id) ?? [];
    const center = locs.length === 0 ? "Unassigned" : locs.length > 1 ? "All centers" : locs[0];
    return {
      id: s.id,
      name: s.full_name,
      email: s.email,
      role: s.title || s.role,
      center,
      completed: completedByStaff.get(s.id) ?? 0,
      total: totalModules,
      credsCleared: clearedCountMap[s.id] ?? 0,
      credsTotal: ALL_CREDENTIAL_TYPES.length,
      cleared: s.role === "staff" ? (clearanceMap[s.id] ?? false) : null,
    };
  });

  return (
    <div className="max-w-[1240px]">
      <StaffDirectoryTable rows={rows} centers={allCenters} />
    </div>
  );
}
