import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createChild } from "@/lib/children/actions";
import { CADENCE_LABELS, FUNDING_TYPE_LABELS, SCHEDULE_LABELS } from "@/lib/children/labels";
import { ChildrenTable, type ChildRow } from "@/components/children/children-table";

export default async function ChildrenPage() {
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const [{ data: children }, { data: locations }, { data: guardianLinks }] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name, dob, status, funding_type, weekly_rate, locations(name)")
      .eq("tenant_id", session.profile.tenantId)
      .order("full_name"),
    supabase
      .from("locations")
      .select("id, name")
      .eq("tenant_id", session.profile.tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("child_guardians").select("child_id"),
  ]);

  const guardianCountByChild = new Map<string, number>();
  for (const row of guardianLinks ?? []) {
    guardianCountByChild.set(row.child_id, (guardianCountByChild.get(row.child_id) ?? 0) + 1);
  }

  const rows: ChildRow[] = (children ?? []).map((c) => {
    const loc = Array.isArray(c.locations) ? c.locations[0] : c.locations;
    return {
      id: c.id,
      name: c.full_name,
      dob: c.dob,
      location: loc?.name ?? "Unassigned",
      status: c.status,
      fundingType: c.funding_type,
      weeklyRate: c.weekly_rate,
      guardianCount: guardianCountByChild.get(c.id) ?? 0,
    };
  });

  const locationNames = Array.from(new Set(rows.map((r) => r.location))).sort();

  return (
    <div className="max-w-[1240px]">
      <ChildrenTable rows={rows} locations={locationNames} />

      <details className="group mt-4 max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4.5 py-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50">
          + Add a child
        </summary>
        <form
          action={createChild}
          className="grid grid-cols-1 gap-2.5 border-t border-gray-100 p-4.5 sm:grid-cols-2"
        >
          <input
            name="fullName"
            placeholder="Full name"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none sm:col-span-2"
          />
          <label className="flex flex-col text-xs text-gray-500">
            Date of birth
            <input
              type="date"
              name="dob"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Location
            <select
              name="locationId"
              required
              defaultValue=""
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            >
              <option value="" disabled>
                Select a location
              </option>
              {(locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <input
            name="classroom"
            placeholder="Classroom (optional)"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <label className="flex flex-col text-xs text-gray-500">
            Status
            <select
              name="status"
              defaultValue="active"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="waitlisted">Waitlisted</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Funding type
            <select
              name="fundingType"
              defaultValue="private"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            >
              {Object.entries(FUNDING_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Schedule
            <select
              name="schedule"
              defaultValue="full_time"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            >
              {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Weekly rate ($)
            <input
              type="number"
              step="0.01"
              min="0"
              name="weeklyRate"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Cadence
            <select
              name="cadence"
              defaultValue="weekly"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            >
              {Object.entries(CADENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Start date
            <input
              type="date"
              name="startDate"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
          <input
            name="rateNote"
            placeholder="Rate note (optional — discounts, sibling rate, etc.)"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none sm:col-span-2"
          />
          <button
            type="submit"
            className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 sm:col-span-2"
          >
            Add child
          </button>
        </form>
      </details>
    </div>
  );
}
