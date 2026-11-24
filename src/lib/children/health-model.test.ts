import { describe, expect, it } from "vitest";

import {
  canEditChildHealth,
  compareAllergies,
  healthAlertsByChild,
  showsAllergyAlert,
} from "./health-model";

describe("canEditChildHealth", () => {
  it("lets owners, head admins, and site leads edit", () => {
    expect(canEditChildHealth("platform_admin", false)).toBe(true);
    expect(canEditChildHealth("director", false)).toBe(true);
    expect(canEditChildHealth("staff", true)).toBe(true);
  });

  it("lets a teacher read only", () => {
    expect(canEditChildHealth("staff", false)).toBe(false);
  });
});

describe("showsAllergyAlert", () => {
  it("flags a structured allergen or a free-text note", () => {
    expect(showsAllergyAlert({ allergyCount: 1, allergyNotes: null })).toBe(true);
    expect(showsAllergyAlert({ allergyCount: 0, allergyNotes: "Peanuts" })).toBe(true);
  });

  it("ignores a blank note", () => {
    expect(showsAllergyAlert({ allergyCount: 0, allergyNotes: "  " })).toBe(false);
    expect(showsAllergyAlert({ allergyCount: 0, allergyNotes: null })).toBe(false);
  });
});

describe("healthAlertsByChild", () => {
  it("combines allergen rows, notes, and asthma", () => {
    const alerts = healthAlertsByChild(
      [{ child_id: "a" }],
      [
        { child_id: "b", allergy_notes: "Dairy", has_asthma: false },
        { child_id: "c", allergy_notes: null, has_asthma: true },
        { child_id: "a", allergy_notes: "  ", has_asthma: true },
      ],
    );

    expect(alerts.get("a")).toEqual({ hasAllergy: true, hasAsthma: true });
    expect(alerts.get("b")).toEqual({ hasAllergy: true, hasAsthma: false });
    expect(alerts.get("c")).toEqual({ hasAllergy: false, hasAsthma: true });
  });
});

describe("compareAllergies", () => {
  it("orders life-threatening ahead of mild, then by name", () => {
    const rows = [
      { severity: "mild" as const, allergen: "Pollen" },
      { severity: "life_threatening" as const, allergen: "Peanuts" },
      { severity: "severe" as const, allergen: "Bees" },
      { severity: "severe" as const, allergen: "Ants" },
    ];
    expect(rows.sort(compareAllergies).map((row) => row.allergen)).toEqual([
      "Peanuts",
      "Ants",
      "Bees",
      "Pollen",
    ]);
  });
});
