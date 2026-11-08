import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { RoomManager, type LocationOption, type RoomRow } from "@/components/rooms/room-manager";

export const metadata = { title: "Rooms" };

/**
 * Rooms, for every role.
 *
 * Open to staff as well as directors: naming the room you work in every day
 * is not a financial decision, and routing it through a director is how the
 * centre ended up with five campuses and zero classrooms.
 *
 * The enrolled count is read from `children` for a director and from
 * `child_people` for staff -- the same rows either way, but staff must go
 * through the view, since the table itself is closed to them.
 */
export default async function RoomsPage() {
  const session = await verifySession();
  const tenantId = session.profile.tenantId;
  const isDirector = session.profile.role !== "staff";

  const supabase = await createClient();

  const [{ data: rooms }, { data: locations }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, location_id, capacity, min_age_months, max_age_months, is_active")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("locations")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const { data: enrolled } = isDirector
    ? await supabase
        .from("children")
        .select("room_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
    : await supabase
        .from("child_people")
        .select("room_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active");

  const countByRoom = new Map<string, number>();
  for (const row of enrolled ?? []) {
    if (!row.room_id) continue;
    countByRoom.set(row.room_id, (countByRoom.get(row.room_id) ?? 0) + 1);
  }

  const locationNames = new Map((locations ?? []).map((l) => [l.id, l.name]));

  const rows: RoomRow[] = (rooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    locationId: r.location_id,
    locationName: locationNames.get(r.location_id) ?? "Unassigned",
    capacity: r.capacity,
    minAgeMonths: r.min_age_months,
    maxAgeMonths: r.max_age_months,
    isActive: r.is_active,
    childCount: countByRoom.get(r.id) ?? 0,
  }));

  const locationOptions: LocationOption[] = (locations ?? []).map((l) => ({
    id: l.id,
    name: l.name,
  }));

  return <RoomManager rooms={rows} locations={locationOptions} />;
}
