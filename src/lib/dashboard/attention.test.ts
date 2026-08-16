import { describe, expect, it } from "vitest";

import { buildAttentionItems, type AttentionInput } from "./attention";

const quiet: AttentionInput = {
  clearance: { total: 29, clearedCount: 29 },
  expiring: [],
  aging: [],
  openShifts: [],
  staleVisits: [],
};

describe("buildAttentionItems", () => {
  it("says nothing when nothing is wrong", () => {
    // The whole point of the section: empty is meaningful.
    expect(buildAttentionItems(quiet)).toEqual([]);
  });

  it("raises uncleared staff as critical", () => {
    const [item] = buildAttentionItems({ ...quiet, clearance: { total: 29, clearedCount: 2 } });
    expect(item.severity).toBe("critical");
    expect(item.claim).toBe("27 staff aren't cleared for solo supervision");
    expect(item.value).toBe("27");
  });

  it("uses singular wording for one person", () => {
    const [item] = buildAttentionItems({ ...quiet, clearance: { total: 29, clearedCount: 28 } });
    expect(item.claim).toBe("1 staff member isn't cleared for solo supervision");
  });

  it("treats a credential expiring within 30 days as critical", () => {
    const [item] = buildAttentionItems({ ...quiet, expiring: [{ daysUntil: 9 }] });
    expect(item.severity).toBe("critical");
    expect(item.claim).toBe("A credential expires in 9 days");
  });

  it("treats 31-60 days out as a warning, not a crisis", () => {
    const [item] = buildAttentionItems({ ...quiet, expiring: [{ daysUntil: 45 }] });
    expect(item.severity).toBe("warn");
  });

  it("reports the soonest expiry when several are pending", () => {
    const [item] = buildAttentionItems({
      ...quiet,
      expiring: [{ daysUntil: 40 }, { daysUntil: 12 }, { daysUntil: 55 }],
    });
    expect(item.claim).toBe("3 credentials expire soon, the first in 12 days");
    expect(item.severity).toBe("critical");
  });

  it("sums overdue balances and names the oldest", () => {
    const [item] = buildAttentionItems({
      ...quiet,
      aging: [
        { daysOverdue: 12, amount: 140 },
        { daysOverdue: 31, amount: 70.5 },
      ],
    });
    expect(item.severity).toBe("warn");
    expect(item.claim).toBe("2 families are overdue, the oldest by 31 days");
    expect(item.value).toBe("$210.50");
  });

  it("flags only shifts that need correcting", () => {
    const items = buildAttentionItems({
      ...quiet,
      openShifts: [{ needsCorrection: false }, { needsCorrection: true }],
    });
    expect(items).toHaveLength(1);
    expect(items[0].claim).toBe("A shift is still open and needs correcting");
  });

  it("ignores open shifts that are simply in progress", () => {
    const items = buildAttentionItems({
      ...quiet,
      openShifts: [{ needsCorrection: false }, { needsCorrection: false }],
    });
    expect(items).toEqual([]);
  });

  it("flags a child still checked in from earlier", () => {
    const [item] = buildAttentionItems({ ...quiet, staleVisits: [{ childId: "c1" }] });
    expect(item.severity).toBe("warn");
    expect(item.claim).toBe("A child is still checked in from earlier");
    expect(item.href).toBe("/attendance/children");
  });

  it("pluralises stale visits", () => {
    const [item] = buildAttentionItems({
      ...quiet,
      staleVisits: [{ childId: "c1" }, { childId: "c2" }],
    });
    expect(item.claim).toBe("2 children are still checked in from earlier");
    expect(item.value).toBe("2");
  });

  it("ranks a stale child visit above overdue money", () => {
    // Both are warnings and only three items survive, so this ordering is
    // what decides which warning a director actually sees.
    const items = buildAttentionItems({
      ...quiet,
      aging: [{ daysOverdue: 3, amount: 100 }],
      staleVisits: [{ childId: "c1" }],
    });
    expect(items.map((i) => i.id)).toEqual(["staleVisits", "overdue"]);
  });

  it("puts critical items above warnings", () => {
    const items = buildAttentionItems({
      clearance: { total: 29, clearedCount: 2 },
      expiring: [{ daysUntil: 5 }],
      aging: [{ daysOverdue: 3, amount: 100 }],
      openShifts: [],
      staleVisits: [],
    });
    expect(items.map((i) => i.severity)).toEqual(["critical", "critical", "warn"]);
  });

  it("shows at most three, so the section stays readable", () => {
    const items = buildAttentionItems({
      clearance: { total: 29, clearedCount: 2 },
      expiring: [{ daysUntil: 5 }],
      aging: [{ daysOverdue: 3, amount: 100 }],
      openShifts: [{ needsCorrection: true }],
      staleVisits: [],
    });
    expect(items).toHaveLength(3);
    // The dropped item is a warning, never a critical one.
    expect(items.every((i) => i.id !== "shifts")).toBe(true);
  });
});
