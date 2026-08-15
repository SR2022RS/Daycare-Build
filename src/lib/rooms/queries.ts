import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import { daysWaiting, occupancyFor, type RoomOccupancy } from "./occupancy";

export interface WaitlistChild {
  id: string;
  fullName: string;
  dob: string;
  daysWaiting: number | null;
  waitlistedAt: string | null;
  desiredStartDate: string | null;
}

export interface WaitlistGroup {
  /** null is the "Unassigned" bucket -- waiting before a room is decided. */
  roomId: string | null;
  roomName: string;
  locationName: string | null;
  occupancy: RoomOccupancy;
  waiting: WaitlistChild[];
}

/**
 * Every active room plus an Unassigned bucket, each with its seat occupancy
 * and the families waiting for it, ordered longest-waiting first.
 *
 * Occupancy counts only status = 'active' children: waitlisted and inactive
 * children never consume a seat.
 */
export async function getWaitlist(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<WaitlistGroup[]> {
  const [{ data: rooms }, { data: enrolled }, { data: waiting }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, capacity, locations(name)")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("children")
      .select("room_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    supabase
      .from("children")
      .select("id, full_name, dob, room_id, waitlisted_at, desired_start_date, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "waitlisted")
      // waitlisted_at is the ordering key; created_at breaks ties for two
      // families added the same day. nullsFirst: false keeps undated entries
      // at the bottom rather than jumping the queue.
      .order("waitlisted_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  const enrolledByRoom = new Map<string | null, number>();
  for (const row of enrolled ?? []) {
    const key = row.room_id;
    enrolledByRoom.set(key, (enrolledByRoom.get(key) ?? 0) + 1);
  }

  // rooms was queried with is_active = true, so a child whose room_id
  // points at a room that has since been soft-deactivated has a room_id
  // that will match no group built below. That's expected, not a data
  // error: rooms are soft-deactivated (is_active = false) rather than
  // deleted -- the FK is ON DELETE SET NULL, so an outright-deleted room
  // already lands in the null key, but a deactivated one keeps its id.
  // Task 8's child-edit form also lets a director set room_id directly on
  // a waitlisted child, so "waiting on a room that later closes" is a
  // normal path, not just a deletion race. Route both the null key and any
  // orphaned-room rows into one Unassigned list, built here in the same
  // pass so it stays in the query's longest-waiting-first order rather
  // than being re-merged from separate map buckets afterward.
  const activeRoomIds = new Set((rooms ?? []).map((r) => r.id));

  const waitingByRoom = new Map<string, WaitlistChild[]>();
  const unassigned: WaitlistChild[] = [];
  for (const row of waiting ?? []) {
    const child: WaitlistChild = {
      id: row.id,
      fullName: row.full_name,
      dob: row.dob,
      daysWaiting: daysWaiting(row.waitlisted_at),
      waitlistedAt: row.waitlisted_at,
      desiredStartDate: row.desired_start_date,
    };
    if (row.room_id !== null && activeRoomIds.has(row.room_id)) {
      const list = waitingByRoom.get(row.room_id);
      if (list) list.push(child);
      else waitingByRoom.set(row.room_id, [child]);
    } else {
      unassigned.push(child);
    }
  }

  const groups: WaitlistGroup[] = (rooms ?? []).map((r) => {
    const location = Array.isArray(r.locations) ? r.locations[0] : r.locations;
    return {
      roomId: r.id,
      roomName: r.name,
      locationName: location?.name ?? null,
      occupancy: occupancyFor(r.capacity, enrolledByRoom.get(r.id) ?? 0),
      waiting: waitingByRoom.get(r.id) ?? [],
    };
  });

  if (unassigned.length > 0) {
    groups.push({
      roomId: null,
      roomName: "Unassigned",
      locationName: null,
      occupancy: occupancyFor(null, enrolledByRoom.get(null) ?? 0),
      waiting: unassigned,
    });
  }

  return groups;
}
