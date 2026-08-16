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

  it("falls back to the generic message for staff_not_in_tenant rather than leaking it", () => {
    expect(mapChildAttendanceError("staff_not_in_tenant", GENERIC)).toBe(GENERIC);
  });

  it("falls back to the generic message for room_not_at_location rather than leaking it", () => {
    expect(mapChildAttendanceError("room_not_at_location", GENERIC)).toBe(GENERIC);
  });

  it("falls back to the generic message for an unrecognized exception", () => {
    expect(mapChildAttendanceError("child not active", GENERIC)).toBe(GENERIC);
  });

  it("falls back to the generic message when there is no message at all", () => {
    expect(mapChildAttendanceError(undefined, GENERIC)).toBe(GENERIC);
  });
});
