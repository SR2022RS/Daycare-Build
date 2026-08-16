/** A visit open longer than this is a missed check-out, not a long day. */
const STALE_VISIT_HOURS = 12;

export interface PresentChild {
  visitId: string;
  childId: string;
  fullName: string;
  roomId: string | null;
  roomName: string;
  checkedInAt: string;
  hoursPresent: number;
}

export function hoursPresent(checkedInAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(checkedInAt).getTime();
  // Clock skew between the kiosk and the server shouldn't render as negative
  // time on a roster a staff member is reading.
  return Math.max(0, Math.round((ms / 3_600_000) * 10) / 10);
}

/**
 * A visit still open after half a day almost certainly means someone forgot to
 * check the child out. It is flagged rather than auto-closed: inventing a
 * departure time would corrupt the very record an audit relies on.
 */
export function isStaleVisit(checkedInAt: string, now: Date = new Date()): boolean {
  return hoursPresent(checkedInAt, now) >= STALE_VISIT_HOURS;
}
