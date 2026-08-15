import Link from "next/link";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createChild } from "@/lib/children/actions";
import { CADENCE_LABELS, FUNDING_TYPE_LABELS, SCHEDULE_LABELS } from "@/lib/children/labels";
import { ChildrenTable, type ChildRow } from "@/components/children/children-table";

export default async function ChildrenPage() {
  const session = await verifySession();

  if (session.profile.role === "staff") {
    return <StaffChildrenList tenantId={session.profile.tenantId} />;
  }

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

// Staff get a minimal, non-filterable roster -- name, classroom, and whether
// the family is behind on payment. No rates, funding type, or guardians;
// child_balance_status is the only billing surface staff can read.
async function StaffChildrenList({ tenantId }: { tenantId: string }) {
  const supabase = await createClient();

  const [{ data: children }, { data: balanceRows }] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name, classroom, locations(name)")
      .eq("tenant_id", tenantId)
      .order("full_name"),
    supabase.from("child_balance_status").select("child_id, balance_status").eq("tenant_id", tenantId),
  ]);

  const balanceByChild = new Map((balanceRows ?? []).map((b) => [b.child_id, b.balance_status]));

  const rows = (children ?? []).map((c) => {
    const location = Array.isArray(c.locations) ? c.locations[0] : c.locations;
    return {
      id: c.id,
      name: c.full_name,
      classroom: c.classroom,
      locationName: location?.name ?? "Unassigned",
      overdue: balanceByChild.get(c.id) === "overdue",
    };
  });

  return (
    <div className="max-w-[720px]">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h1 className="font-serif text-[14.5px] font-semibold text-gray-900">Children</h1>
        </div>
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/children/${r.id}`}
                className="flex items-center justify-between gap-3 px-4.5 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-gray-900">{r.name}</div>
                  <div className="truncate text-[11.5px] text-gray-400">
                    {r.classroom || "No classroom"} &middot; {r.locationName}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                    r.overdue ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                  }`}
                >
                  {r.overdue ? "Overdue" : "Current"}
                </span>
              </Link>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4.5 py-6 text-center text-sm text-gray-500">No children on file.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
