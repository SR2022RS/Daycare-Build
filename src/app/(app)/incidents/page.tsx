import { ShieldAlert } from "lucide-react";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { fileIncident, markParentNotified, signIncident } from "@/lib/incidents/actions";
import type { IncidentStatus } from "@/types/database.types";

const STATUS_LABELS: Record<IncidentStatus, string> = {
  filed: "Filed",
  signed: "Signed",
  parent_notified: "Parent notified",
};

const STATUS_TONE: Record<IncidentStatus, string> = {
  filed: "bg-amber-50 text-amber-700",
  signed: "bg-blue-50 text-blue-700",
  parent_notified: "bg-green-50 text-green-700",
};

export default async function IncidentsPage() {
  const session = await verifySession();
  const supabase = await createClient();
  const isDirector = session.profile.role !== "staff";
  const canManage = isDirector || session.profile.isSiteLead;

  const { data: incidents } = await supabase
    .from("incident_reports")
    .select(
      "id, child_name, what_happened, action_taken, status, created_at, filed_by, locations(name), reporter:profiles!incident_reports_filed_by_fkey(full_name)",
    )
    .order("created_at", { ascending: false });

  // Directors aren't necessarily assigned to a location via staff_locations
  // (has_location_access grants them every location by role), so their
  // filing dropdown draws from the full tenant location list instead.
  let myLocations: { id: string; name: string }[] = [];
  if (isDirector) {
    const { data } = await supabase
      .from("locations")
      .select("id, name")
      .eq("tenant_id", session.profile.tenantId)
      .eq("is_active", true);
    myLocations = data ?? [];
  } else {
    const { data } = await supabase
      .from("staff_locations")
      .select("locations(id, name)")
      .eq("staff_id", session.profile.id);
    myLocations = (data ?? [])
      .map((row) => (Array.isArray(row.locations) ? row.locations[0] : row.locations))
      .filter((l): l is { id: string; name: string } => Boolean(l));
  }

  const rows = (incidents ?? []).map((row) => {
    const location = Array.isArray(row.locations) ? row.locations[0] : row.locations;
    const reporter = Array.isArray(row.reporter) ? row.reporter[0] : row.reporter;
    return { ...row, locationName: location?.name ?? "Unknown", reporterName: reporter?.full_name ?? "Unknown" };
  });

  const mine = rows.filter((r) => r.filed_by === session.profile.id);
  const queue = canManage ? rows.filter((r) => r.status !== "parent_notified") : [];

  return (
    <div className="max-w-[1100px]">
      {canManage && (
        <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4.5 py-3.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[var(--brand-primary)]" />
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Sign-off queue</h2>
            </div>
            <span className="text-[11.5px] text-gray-400">{queue.length} open</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {queue.map((r) => (
              <li key={r.id} className="px-4.5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-gray-900">{r.child_name}</span>
                  <span className="text-[11.5px] text-gray-400">
                    {r.locationName} &middot; filed by {r.reporterName} &middot; {r.created_at.slice(0, 10)}
                  </span>
                  <span
                    className={`ml-auto rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${STATUS_TONE[r.status]}`}
                  >
                    {STATUS_LABELS[r.status]}
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] text-gray-600">
                  <span className="font-medium text-gray-700">What happened:</span> {r.what_happened}
                </p>
                <p className="mt-1 text-[12.5px] text-gray-600">
                  <span className="font-medium text-gray-700">Action taken:</span> {r.action_taken}
                </p>
                <div className="mt-2 flex gap-2">
                  {r.status === "filed" && (
                    <form action={signIncident}>
                      <input type="hidden" name="incidentId" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-semibold text-[#06323A] hover:opacity-90"
                      >
                        Sign
                      </button>
                    </form>
                  )}
                  {r.status === "signed" && (
                    <form action={markParentNotified}>
                      <input type="hidden" name="incidentId" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Mark parent notified
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
            {queue.length === 0 && (
              <li className="px-4.5 py-6 text-center text-sm text-gray-500">Nothing needs sign-off.</li>
            )}
          </ul>
        </section>
      )}

      <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">My filed reports</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {mine.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4.5 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-gray-900">{r.child_name}</p>
                <p className="truncate text-[11.5px] text-gray-400">
                  {r.locationName} &middot; {r.created_at.slice(0, 10)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${STATUS_TONE[r.status]}`}
              >
                {STATUS_LABELS[r.status]}
              </span>
            </li>
          ))}
          {mine.length === 0 && (
            <li className="px-4.5 py-6 text-center text-sm text-gray-500">
              You haven&apos;t filed any incident reports.
            </li>
          )}
        </ul>
      </section>

      <details className="group max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4.5 py-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50">
          + File an incident report
        </summary>
        <form action={fileIncident} className="flex flex-col gap-2.5 border-t border-gray-100 p-4.5">
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
              {myLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <input
            name="childName"
            placeholder="Child's name"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <textarea
            name="whatHappened"
            placeholder="What happened?"
            required
            rows={3}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <textarea
            name="actionTaken"
            placeholder="Action taken"
            required
            rows={2}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <button
            type="submit"
            className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
          >
            File report
          </button>
        </form>
      </details>
    </div>
  );
}
