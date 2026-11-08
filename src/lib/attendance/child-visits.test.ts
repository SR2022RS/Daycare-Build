import { describe, expect, it } from "vitest";

import { hoursPresent, isStaleVisit } from "./child-visits";

const at = (iso: string) => new Date(iso);

describe("hoursPresent", () => {
  it("measures a part-day visit", () => {
    expect(hoursPresent("2026-08-17T08:00:00Z", at("2026-08-17T11:30:00Z"))).toBe(3.5);
  });

  it("rounds to one decimal", () => {
    expect(hoursPresent("2026-08-17T08:00:00Z", at("2026-08-17T08:20:00Z"))).toBe(0.3);
  });

  it("never reports negative time for a clock skew", () => {
    expect(hoursPresent("2026-08-17T09:00:00Z", at("2026-08-17T08:00:00Z"))).toBe(0);
  });
});

describe("isStaleVisit", () => {
  it("accepts a normal day", () => {
    expect(isStaleVisit("2026-08-17T08:00:00Z", at("2026-08-17T17:00:00Z"))).toBe(false);
  });

  it("flags a visit still open after 12 hours", () => {
    // Nobody's child is at daycare for 12 hours; this is a missed check-out,
    // and it must be flagged rather than silently closed.
    expect(isStaleVisit("2026-08-17T07:00:00Z", at("2026-08-17T19:30:00Z"))).toBe(true);
  });

  it("flags a visit left open overnight", () => {
    expect(isStaleVisit("2026-08-17T08:00:00Z", at("2026-08-18T08:00:00Z"))).toBe(true);
  });
});
