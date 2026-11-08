// Pure mapping from a raised RPC exception name to a message a person
// standing at the kiosk can act on. Split out from actions.ts (a "use
// server" module, which may only export async functions) so this logic is
// unit-testable without a database.
//
// Matching is substring (`includes`), not exact equality. Nobody has
// confirmed PostgREST hands back `raise exception 'no_open_visit'` as
// exactly that bare string rather than some decorated/prefixed form (e.g.
// wrapped in a JSON blob with a "code" field), and this path can't be
// exercised without a live database (see the task report). `includes` finds
// the exception name whether the string arrives bare or dressed up; an
// exact-match mapper would silently degrade every case to the generic
// message the moment the real shape turns out to be decorated, and the
// bare-string unit tests would never catch that.
//
// Exceptions get their own message when a guardian/staff member at the
// kiosk can actually act on them. Everything else -- a claim mismatch the
// action's own pre-checks should already have caught, a room outside the
// child's location, or anything unrecognized -- falls back to the generic
// kiosk message rather than leaking a raw exception name to the screen.
export function mapChildAttendanceError(message: string | undefined, genericMessage: string): string {
  if (!message) return genericMessage;
  if (message.includes("no_open_visit")) return "This child isn't checked in.";
  if (message.includes("guardian_not_linked")) return "That child isn't linked to your account.";
  // Reachable in normal use -- a withdrawn child, or a tablet with a stale
  // roster cached -- and it's an enrollment fact, not a system failure, so
  // it shouldn't send a parent to the director.
  if (message.includes("child not active")) return "That child isn't enrolled here right now.";
  return genericMessage;
}
