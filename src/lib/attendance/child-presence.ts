import type { SupabaseClient } from "@supabase/supabase-js";

import { hoursPresent, isStaleVisit, type PresentChild } from "@/lib/attendance/child-visits";
import type { Database } from "@/types/database.types";

export interface PresenceGroup {
  roomId: string | null;
  roomName: string;
  children: PresentChild[];
}

export interface PresenceBoard {
  rooms: PresenceGroup[];
  total: number;
  /** Visits open longer than STALE_VISIT_HOURS -- missed check-outs, not long days. */
  stale: PresentChild[];
}

const UNASSIGNED = "Unassigned";

/**
 * Who is physically present right now, grouped by room.
 *
 * Three RLS-scoped queries rather than one embedded join, for one specific
 * reason: **staff cannot read `public.children`**. `children_select`
 * (20260802224828) admits directors only, deliberately, because that table
 * carries weekly_rate, subsidy_weekly_amount and rate_note. A
 * `child_attendance` row does not store the child's name, so the names have
 * to come from `child_balance_status` -- the staff-safe view built for
 * exactly this problem (20260814120400, location-scoped by 20260814120500).
 * An embedded `children(full_name)` here would have rendered an empty board
 * for every staff user while working perfectly for the director testing it.
 *
 * No filtering is done in application code. `child_attendance_select` and
 * the view apply the same `has_location_access` test, so a staff member sees
 * only their own sites and a director sees the whole tenant, from the same
 * call.
 */
export async function getPresentChildren(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  now: Date = new Date(),
): Promise<PresenceBoard> {
  const { data: visits } = await supabase
    .from("child_attendance")
    .select("id, child_id, room_id, checked_in_at")
    .eq("tenant_id", tenantId)
    .is("checked_out_at", null)
    .order("checked_in_at", { ascending: true });

  if (!visits || visits.length === 0) {
    return { rooms: [], total: 0, stale: [] };
  }

  const [{ data: rooms }, { data: names }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("child_balance_status")
      .select("child_id, full_name")
      .in(
        "child_id",
        visits.map((v) => v.child_id),
      ),
  ]);

  // Same handling as getWaitlist: rooms are soft-deactivated rather than
  // deleted, so a visit can carry a room_id that matches no active room.
  // Both that case and a null room_id land in Unassigned -- a present child
  // must never vanish from a board whose whole job is "who is in the
  // building", and the two are indistinguishable to the person reading it.
  const roomNames = new Map((rooms ?? []).map((r) => [r.id, r.name]));
  const nameById = new Map((names ?? []).map((n) => [n.child_id, n.full_name]));

  const groups = new Map<string | null, PresenceGroup>();
  const stale: PresentChild[] = [];

  for (const visit of visits) {
    const roomId = visit.room_id !== null && roomNames.has(visit.room_id) ? visit.room_id : null;
    const child: PresentChild = {
      visitId: visit.id,
      childId: visit.child_id,
      roomId,
      roomName: roomId === null ? UNASSIGNED : roomNames.get(roomId)!,
      // A name the view didn't return means the child record moved out from
      // under an open visit. Render the visit anyway: dropping it would
      // undercount who is in the building, which is the one number this page
      // exists to get right.
      fullName: nameById.get(visit.child_id) ?? "Child record unavailable",
      checkedInAt: visit.checked_in_at,
      hoursPresent: hoursPresent(visit.checked_in_at, now),
    };

    const group = groups.get(roomId);
    if (group) group.children.push(child);
    else groups.set(roomId, { roomId, roomName: child.roomName, children: [child] });

    if (isStaleVisit(visit.checked_in_at, now)) stale.push(child);
  }

  // Rooms in name order, Unassigned last -- it is a remainder, not a room.
  const ordered = [...groups.values()]
    .filter((g) => g.roomId !== null)
    .sort((a, b) => a.roomName.localeCompare(b.roomName));
  const unassigned = groups.get(null);
  if (unassigned) ordered.push(unassigned);

  return { rooms: ordered, total: visits.length, stale };
}
