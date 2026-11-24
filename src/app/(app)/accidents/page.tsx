import { verifySession } from "@/lib/auth/dal";
import { loadAccidentRows } from "@/lib/accidents/queries";
import { createClient } from "@/lib/supabase/server";
import { AccidentList } from "@/components/accidents/accident-list";
import { FileAccidentForm, type AccidentChildOption } from "@/components/accidents/file-accident-form";

export const metadata = { title: "Accident reports" };

export default async function AccidentsPage() {
  const session = await verifySession();
  const supabase = await createClient();
  const tenantId = session.profile.tenantId;
  const isDirector = session.profile.role !== "staff";

  const [list, locationsResult, childrenResult, assignments] = await Promise.all([
    loadAccidentRows(supabase, tenantId),
    supabase.from("locations").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
    supabase
      .from("child_people")
      .select("child_id, full_name, location_id")
      .eq("tenant_id", tenantId)
      .order("full_name"),
    isDirector
      ? Promise.resolve({ data: null })
      : supabase.from("staff_locations").select("location_id").eq("staff_id", session.profile.id),
  ]);

  const allLocations = locationsResult.data ?? [];
  const assigned = new Set((assignments.data ?? []).map((row) => row.location_id));
  const locations = isDirector ? allLocations : allLocations.filter((location) => assigned.has(location.id));

  const children: AccidentChildOption[] = (childrenResult.data ?? [])
    .filter((child) => child.location_id)
    .map((child) => ({
      id: child.child_id,
      fullName: child.full_name,
      locationId: child.location_id as string,
    }));

  const campusNames = [...new Set((list.ok ? list.rows : []).map((row) => row.locationName))].sort();

  return (
    <div className="max-w-[900px]">
      {!list.ok && (
        <p className="mb-3 rounded-md bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
          Accident reports could not be loaded.
        </p>
      )}
      <AccidentList rows={list.ok ? list.rows : []} locations={campusNames} />

      <details className="group mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4.5 py-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50">
          + File an accident report
        </summary>
        <FileAccidentForm locations={locations} enrolled={children} />
      </details>
    </div>
  );
}
