import { describe, expect, it } from "vitest";

import { firstMondayOf, nextPeriodStart, periodFor, prorationFraction, thirdMondayOf } from "./periods";

// 2026-08-03 is the 1st Monday of Aug 2026; 2026-08-17 is the 3rd Monday.
describe("firstMondayOf / thirdMondayOf", () => {
  it("finds the 1st and 3rd Monday of August 2026", () => {
    expect(firstMondayOf(2026, 7).toISOString().slice(0, 10)).toBe("2026-08-03");
    expect(thirdMondayOf(2026, 7).toISOString().slice(0, 10)).toBe("2026-08-17");
  });

  it("handles a month that starts on a Monday (June 2026)", () => {
    expect(firstMondayOf(2026, 5).toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(thirdMondayOf(2026, 5).toISOString().slice(0, 10)).toBe("2026-06-15");
  });
});

describe("periodFor weekly", () => {
  it("returns Mon-Sun when given a Monday", () => {
    expect(periodFor("weekly", new Date("2026-08-17T00:00:00Z"))).toEqual({
      start: "2026-08-17",
      end: "2026-08-23",
    });
  });

  it("returns null on a non-Monday", () => {
    expect(periodFor("weekly", new Date("2026-08-18T00:00:00Z"))).toBeNull();
  });
});

describe("periodFor monthly", () => {
  it("returns the whole month when given the 1st", () => {
    expect(periodFor("monthly", new Date("2026-08-01T00:00:00Z"))).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("returns null on any other day", () => {
    expect(periodFor("monthly", new Date("2026-08-02T00:00:00Z"))).toBeNull();
  });
});

describe("periodFor biweekly", () => {
  it("period A runs 1st Monday to the day before the 3rd Monday", () => {
    expect(periodFor("biweekly", new Date("2026-08-03T00:00:00Z"))).toEqual({
      start: "2026-08-03",
      end: "2026-08-16",
    });
  });

  it("period B runs 3rd Monday to the day before next month's 1st Monday", () => {
    // Next 1st Monday after Aug 2026 is 2026-09-07, so period B ends 2026-09-06.
    expect(periodFor("biweekly", new Date("2026-08-17T00:00:00Z"))).toEqual({
      start: "2026-08-17",
      end: "2026-09-06",
    });
  });

  it("returns null on a Monday that is neither the 1st nor 3rd", () => {
    expect(periodFor("biweekly", new Date("2026-08-24T00:00:00Z"))).toBeNull();
  });
});

describe("nextPeriodStart", () => {
  it("weekly: scans forward from mid-week to the next Monday", () => {
    expect(nextPeriodStart("weekly", new Date("2026-08-19T00:00:00Z"))).toBe("2026-08-24");
  });

  it("weekly: returns the same day when it's already a Monday", () => {
    expect(nextPeriodStart("weekly", new Date("2026-08-17T00:00:00Z"))).toBe("2026-08-17");
  });

  it("monthly: scans forward from mid-month to the 1st of next month", () => {
    expect(nextPeriodStart("monthly", new Date("2026-08-15T00:00:00Z"))).toBe("2026-09-01");
  });

  it("monthly: returns the same day when it's already the 1st", () => {
    expect(nextPeriodStart("monthly", new Date("2026-08-01T00:00:00Z"))).toBe("2026-08-01");
  });

  it("monthly: rolls over into the next calendar year", () => {
    expect(nextPeriodStart("monthly", new Date("2026-12-15T00:00:00Z"))).toBe("2027-01-01");
  });

  it("biweekly: from the 2nd Monday (not a period start) lands on the 3rd Monday", () => {
    expect(nextPeriodStart("biweekly", new Date("2026-08-10T00:00:00Z"))).toBe("2026-08-17");
  });

  it("biweekly: from just after the 3rd Monday lands on next month's 1st Monday", () => {
    expect(nextPeriodStart("biweekly", new Date("2026-08-20T00:00:00Z"))).toBe("2026-09-07");
  });
});

describe("prorationFraction", () => {
  it("is 1 when the child started before the period", () => {
    expect(prorationFraction("2026-08-17", "2026-08-23", "2026-01-05")).toBe(1);
  });

  it("is 1 when the child starts exactly on the period start", () => {
    expect(prorationFraction("2026-08-17", "2026-08-23", "2026-08-17")).toBe(1);
  });

  it("charges 5 of 7 days when starting on the Wednesday of a Mon-Sun week", () => {
    expect(prorationFraction("2026-08-17", "2026-08-23", "2026-08-19")).toBe(0.7143);
  });

  it("charges 1 of 7 days when starting on the final day", () => {
    expect(prorationFraction("2026-08-17", "2026-08-23", "2026-08-23")).toBe(0.1429);
  });
});
