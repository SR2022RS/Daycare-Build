import { todayISO } from "@/lib/billing/dates";

/**
 * Seat occupancy for one room. This is capacity, NOT a staffing ratio -- a
 * room can sit under capacity and still be out of ratio. Ratio tracking is a
 * separate feature; nothing here should be read as a compliance signal.
 */
export interface RoomOccupancy {
  capacity: number | null;
  enrolled: number;
  openSpots: number | null;
  isFull: boolean;
}

/**
 * `capacity` is null when a director has not set one. That is reported as
 * "untracked" (null openSpots, never full) rather than zero, so an unset
 * capacity cannot masquerade as a full room and block enrollment decisions.
 */
export function occupancyFor(capacity: number | null, enrolled: number): RoomOccupancy {
  if (capacity === null) {
    return { capacity: null, enrolled, openSpots: null, isFull: false };
  }

  return {
    capacity,
    enrolled,
    // Real centers do exceed a seat count temporarily, so clamp at zero
    // rather than reporting negative spots.
    openSpots: Math.max(capacity - enrolled, 0),
    isFull: enrolled >= capacity,
  };
}

/**
 * Whole days a family has been waiting. Both dates are YYYY-MM-DD strings
 * parsed as UTC midnight, so the subtraction is exact -- but "today" comes
 * from todayISO(), which resolves in the center's timezone. Using
 * `new Date()` here would add a day after ~7pm local.
 */
export function daysWaiting(waitlistedAt: string | null, today: string = todayISO()): number | null {
  if (!waitlistedAt) return null;

  const from = Date.parse(`${waitlistedAt}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;

  const days = Math.round((to - from) / 86_400_000);
  // A future-dated entry is a data-entry slip, not negative waiting time.
  return Math.max(days, 0);
}
