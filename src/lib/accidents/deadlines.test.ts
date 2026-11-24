import { describe, expect, it } from "vitest";

import { documentationDue, nextWorkingDay, oolDeadline } from "./deadlines";

describe("nextWorkingDay", () => {
  it("moves Thursday to Friday", () => {
    expect(nextWorkingDay("2026-11-19")).toBe("2026-11-20");
  });

  it("skips the weekend after a Friday", () => {
    expect(nextWorkingDay("2026-11-20")).toBe("2026-11-23");
  });

  it("skips the weekend after a Saturday", () => {
    expect(nextWorkingDay("2026-11-21")).toBe("2026-11-23");
  });
});

describe("documentationDue", () => {
  it("is seven calendar days after the injury, including the weekend", () => {
    expect(documentationDue("2026-11-20")).toBe("2026-11-27");
  });
});

describe("oolDeadline", () => {
  it("returns both Office of Licensing dates", () => {
    expect(oolDeadline("2026-11-20")).toEqual({
      verbalBy: "2026-11-23",
      documentationBy: "2026-11-27",
    });
  });
});
