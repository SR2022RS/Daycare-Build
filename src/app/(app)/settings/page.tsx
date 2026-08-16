import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createKioskDevice, createRoom, deactivateKioskDevice } from "@/lib/kiosk/actions";
import { getSiteUrl } from "@/lib/site-url";

export default async function SettingsPage() {
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const [{ data: locations }, { data: devices }, { data: rooms }] = await Promise.all([
    supabase.from("locations").select("id, name").eq("tenant_id", session.profile.tenantId).order("name"),
    supabase
      .from("kiosk_devices")
      .select("id, name, device_token, is_active, last_seen_at, locations(name)")
      .eq("tenant_id", session.profile.tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("rooms")
      .select("id, name, locations(name)")
      .eq("tenant_id", session.profile.tenantId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const siteUrl = getSiteUrl();
  const activeDevices = devices ?? [];
  const activeRooms = rooms ?? [];

  return (
    <div className="flex max-w-[900px] flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Kiosk devices</h2>
          <p className="mt-0.5 text-[11.5px] text-gray-400">
            Register a shared tablet per location. Open the link on that device and leave it running &mdash; staff
            clock in/out there with their PIN. A PIN alone never opens the full portal.
          </p>
        </div>
        <ul className="divide-y divide-gray-100">
          {activeDevices.map((d) => {
            const location = Array.isArray(d.locations) ? d.locations[0] : d.locations;
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4.5 py-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-gray-900">
                    {d.name} <span className="font-normal text-gray-400">&middot; {location?.name}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-gray-400">
                    {siteUrl}/kiosk/{d.device_token}
                  </p>
                </div>
                <form action={deactivateKioskDevice}>
                  <input type="hidden" name="deviceId" value={d.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
                  >
                    Deactivate
                  </button>
                </form>
              </li>
            );
          })}
          {activeDevices.length === 0 && (
            <li className="px-4.5 py-6 text-sm text-gray-500">No kiosk devices registered yet.</li>
          )}
        </ul>
        <form action={createKioskDevice} className="flex flex-wrap items-end gap-2 border-t border-gray-100 px-4.5 py-4">
          <label className="flex flex-col text-xs text-gray-500">
            Device name
            <input
              name="name"
              placeholder="Front desk tablet"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Location
            <select
              name="locationId"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            >
              {(locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
          >
            Register device
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Rooms</h2>
          <p className="mt-0.5 text-[11.5px] text-gray-400">Names staff can transfer between from the kiosk.</p>
        </div>
        <ul className="divide-y divide-gray-100">
          {activeRooms.map((r) => {
            const location = Array.isArray(r.locations) ? r.locations[0] : r.locations;
            return (
              <li key={r.id} className="px-4.5 py-2.5 text-[13.5px] text-gray-700">
                {r.name} <span className="text-gray-400">&middot; {location?.name}</span>
              </li>
            );
          })}
          {activeRooms.length === 0 && <li className="px-4.5 py-6 text-sm text-gray-500">No rooms added yet.</li>}
        </ul>
        <form action={createRoom} className="flex flex-wrap items-end gap-2 border-t border-gray-100 px-4.5 py-4">
          <label className="flex flex-col text-xs text-gray-500">
            Room name
            <input
              name="name"
              placeholder="Toddler Room A"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Location
            <select
              name="locationId"
              required
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            >
              {(locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
          >
            Add room
          </button>
        </form>
      </section>
    </div>
  );
}
