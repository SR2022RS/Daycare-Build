import { describe, expect, it } from "vitest";

import { daysWaiting, occupancyFor } from "./occupancy";

describe("occupancyFor", () => {
  it("reports open spots when under capacity", () => {
    expect(occupancyFor(10, 6)).toEqual({
      capacity: 10,
      enrolled: 6,
      openSpots: 4,
      isFull: false,
    });
  });

  it("reports full at exactly capacity", () => {
    expect(occupancyFor(8, 8)).toEqual({
      capacity: 8,
      enrolled: 8,
      openSpots: 0,
      isFull: true,
    });
  });

  it("never reports negative open spots when over capacity", () => {
    expect(occupancyFor(8, 9)).toEqual({
      capacity: 8,
      enrolled: 9,
      openSpots: 0,
      isFull: true,
    });
  });

  it("leaves openSpots null and isFull false when capacity is untracked", () => {
    expect(occupancyFor(null, 6)).toEqual({
      capacity: null,
      enrolled: 6,
      openSpots: null,
      isFull: false,
    });
  });
});

describe("daysWaiting", () => {
  it("returns whole days between the waitlist date and today", () => {
    expect(daysWaiting("2026-08-03", "2026-08-15")).toBe(12);
  });

  it("returns 0 on the day the family joined", () => {
    expect(daysWaiting("2026-08-15", "2026-08-15")).toBe(0);
  });

  it("returns null when there is no waitlist date", () => {
    expect(daysWaiting(null, "2026-08-15")).toBeNull();
  });

  it("does not go negative for a future-dated waitlist entry", () => {
    expect(daysWaiting("2026-08-20", "2026-08-15")).toBe(0);
  });

  it("counts across a month boundary", () => {
    expect(daysWaiting("2026-07-30", "2026-08-02")).toBe(3);
  });
});
