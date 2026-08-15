import { describe, expect, it } from "vitest";

import { overpaymentExcess } from "./overpayment";

describe("overpaymentExcess", () => {
  it("is 0 when the invoice is underpaid", () => {
    expect(overpaymentExcess(100, 60)).toBe(0);
  });

  it("is 0 when paid exactly matches the total", () => {
    expect(overpaymentExcess(100, 100)).toBe(0);
  });

  it("returns the excess for a clean overpayment amount", () => {
    expect(overpaymentExcess(100, 150)).toBe(50);
  });

  it("rounds a fractional overpayment to the cent instead of drifting", () => {
    // 100.05 - 70.10 is 29.949999999999996 in raw floating point.
    expect(overpaymentExcess(70.1, 100.05)).toBe(29.95);
  });

  it("treats a zero/negative total (fully-credited invoice) with a payment on it as fully overpaid", () => {
    expect(overpaymentExcess(0, 25)).toBe(25);
    expect(overpaymentExcess(-10, 25)).toBe(35);
  });
});
