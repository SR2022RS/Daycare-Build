import { describe, expect, it } from "vitest";

import {
  campusToday,
  currentStepSummary,
  dressForDate,
  stepForCount,
  windowStart,
} from "./steps";

describe("windowStart", () => {
  it("starts a school year on the configured month and day", () => {
    expect(windowStart("school_year", "2026-09-01")).toBe("2026-09-01");
    expect(windowStart("school_year", "2026-08-31")).toBe("2025-09-01");
  });

  it("honors a start day other than the first", () => {
    expect(windowStart("school_year", "2026-08-15", 8, 15)).toBe("2026-08-15");
    expect(windowStart("school_year", "2026-08-14", 8, 15)).toBe("2025-08-15");
  });

  it("uses January 1 for a calendar year", () => {
    expect(windowStart("calendar_year", "2026-11-24")).toBe("2026-01-01");
  });

  it("does not reset when the mode is never", () => {
    expect(windowStart("never", "2026-11-24")).toBeNull();
  });
});

describe("stepForCount", () => {
  it("goes verbal, then written, then fee", () => {
    expect(stepForCount(0)).toBe("verbal");
    expect(stepForCount(1)).toBe("written");
    expect(stepForCount(2)).toBe("fee");
    expect(stepForCount(4)).toBe("fee");
  });
});

describe("currentStepSummary", () => {
  it("names the next offense before the fee", () => {
    expect(currentStepSummary(0)).toMatch(/verbal warning/);
    expect(currentStepSummary(1)).toMatch(/written warning/);
    expect(currentStepSummary(2)).toMatch(/\$10 fee/);
  });

  it("counts fee-due rows without calling them paid", () => {
    expect(currentStepSummary(3)).toMatch(/1 fee of \$10/);
    expect(currentStepSummary(3)).toMatch(/Nothing is sent to billing/);
  });
});

describe("dressForDate", () => {
  it("follows the AKPA week", () => {
    expect(dressForDate("2026-11-24").title).toBe("Uniform");
    expect(dressForDate("2026-11-26").title).toBe("Sweatsuit");
    expect(dressForDate("2026-11-27").title).toBe("Tag day — $3");
  });
});

describe("campusToday", () => {
  it("keeps a late evening in New Jersey on that calendar date", () => {
    expect(campusToday(new Date("2026-11-25T03:30:00Z"))).toBe("2026-11-24");
  });
});
