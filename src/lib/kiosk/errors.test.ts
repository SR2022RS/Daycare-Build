import { describe, expect, it } from "vitest";

import { mapChildAttendanceError } from "./errors";

const GENERIC = "This kiosk isn't set up. Contact your director.";

describe("mapChildAttendanceError", () => {
  it("turns no_open_visit into an actionable checkout message", () => {
    expect(mapChildAttendanceError("no_open_visit", GENERIC)).toBe("This child isn't checked in.");
  });

  it("turns guardian_not_linked into an actionable message", () => {
    expect(mapChildAttendanceError("guardian_not_linked", GENERIC)).toBe(
      "That child isn't linked to your account.",
    );
  });

  it("turns child not active into an enrollment message, not a director referral", () => {
    expect(mapChildAttendanceError("child not active", GENERIC)).toBe("That child isn't enrolled here right now.");
  });

  it("falls back to the generic message for staff_not_in_tenant rather than leaking it", () => {
    expect(mapChildAttendanceError("staff_not_in_tenant", GENERIC)).toBe(GENERIC);
  });

  it("falls back to the generic message for room_not_at_location rather than leaking it", () => {
    expect(mapChildAttendanceError("room_not_at_location", GENERIC)).toBe(GENERIC);
  });

  it("falls back to the generic message for an unrecognized exception", () => {
    expect(mapChildAttendanceError("exactly one of guardian or staff must check the child in", GENERIC)).toBe(
      GENERIC,
    );
  });

  it("falls back to the generic message when there is no message at all", () => {
    expect(mapChildAttendanceError(undefined, GENERIC)).toBe(GENERIC);
  });

  // PostgREST's actual on-the-wire shape for a bare `raise exception
  // 'no_open_visit'` has never been confirmed against a live database (no
  // `supabase` commands are available here). Matching by substring rather
  // than exact equality means the mapper still works whether the message
  // arrives bare or wrapped in something like a JSON error envelope --
  // these two cases are what actually prove that, since a bare `===` check
  // would silently degrade both to the generic message.
  it("still maps no_open_visit when the message is wrapped in a decorated PostgREST envelope", () => {
    expect(
      mapChildAttendanceError('unexpected response: {"code":"P0001","message":"no_open_visit"}', GENERIC),
    ).toBe("This child isn't checked in.");
  });

  it("still maps guardian_not_linked when the message is wrapped in a decorated PostgREST envelope", () => {
    expect(
      mapChildAttendanceError('unexpected response: {"code":"P0001","message":"guardian_not_linked"}', GENERIC),
    ).toBe("That child isn't linked to your account.");
  });
});
