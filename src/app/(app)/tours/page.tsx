import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { TourInbox, type TourInboxRow } from "@/components/tours/tour-inbox";

export const metadata = { title: "Tour requests" };

export default async function ToursPage() {
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tour_requests")
    .select(
      "id, parent_name, phone, email, child_ages, desired_start, preferred_time, heard_about, notes, status, admin_notes, created_at, locations(name)",
    )
    .eq("tenant_id", session.profile.tenantId)
    .order("created_at", { ascending: false });

  const rows: TourInboxRow[] = (data ?? []).map((row) => {
    const location = Array.isArray(row.locations) ? row.locations[0] : row.locations;
    return {
      id: row.id,
      parentName: row.parent_name,
      phone: row.phone,
      email: row.email,
      childAges: row.child_ages,
      desiredStart: row.desired_start,
      campusName: location?.name ?? "Campus",
      preferredTime: row.preferred_time,
      heardAbout: row.heard_about,
      notes: row.notes,
      status: row.status,
      adminNotes: row.admin_notes,
      createdOn: row.created_at.slice(0, 10),
    };
  });
  const campuses = [...new Set(rows.map((row) => row.campusName))].sort();

  return (
    <div className="max-w-[900px]">
      {error && (
        <p className="mb-3 rounded-md bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
          Tour requests could not be loaded.
        </p>
      )}
      <TourInbox rows={error ? [] : rows} campuses={campuses} />
    </div>
  );
}
