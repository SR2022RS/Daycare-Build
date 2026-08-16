// Pure mapping from a raised RPC exception name to a message a person
// standing at the kiosk can act on. Split out from actions.ts (a "use
// server" module, which may only export async functions) so this logic is
// unit-testable without a database.
//
// Only the two exceptions a guardian/staff member can actually do something
// about get their own message. Everything else -- a claim mismatch the
// action's own pre-checks should already have caught, a room outside the
// child's location, or anything unrecognized -- falls back to the generic
// kiosk message rather than leaking a raw exception name to the screen.
export function mapChildAttendanceError(message: string | undefined, genericMessage: string): string {
  if (message === "no_open_visit") return "This child isn't checked in.";
  if (message === "guardian_not_linked") return "That child isn't linked to your account.";
  return genericMessage;
}
