import { describe, expect, it } from "vitest";

import { isCheckoutRateLimited } from "./rate-limit";

// Each test uses a distinct IP so the module-level counter can't leak between
// them -- the limiter is deliberately in-memory and process-wide.
describe("isCheckoutRateLimited", () => {
  it("allows a normal run of attempts", () => {
    const ip = "203.0.113.1";
    for (let i = 0; i < 8; i++) {
      expect(isCheckoutRateLimited(ip)).toBe(false);
    }
  });

  it("trips once the window allowance is exceeded", () => {
    const ip = "203.0.113.2";
    for (let i = 0; i < 8; i++) isCheckoutRateLimited(ip);
    expect(isCheckoutRateLimited(ip)).toBe(true);
  });

  it("keeps counting an abusive caller as limited", () => {
    const ip = "203.0.113.3";
    for (let i = 0; i < 20; i++) isCheckoutRateLimited(ip);
    expect(isCheckoutRateLimited(ip)).toBe(true);
  });

  it("tracks each address separately", () => {
    const noisy = "203.0.113.4";
    for (let i = 0; i < 20; i++) isCheckoutRateLimited(noisy);

    // A different visitor must be unaffected by the abuser above.
    expect(isCheckoutRateLimited("203.0.113.5")).toBe(false);
  });

  it("never limits an unidentifiable caller", () => {
    // Everyone without a forwarded IP would otherwise share one bucket, so a
    // single abuser could lock out every such visitor.
    for (let i = 0; i < 50; i++) {
      expect(isCheckoutRateLimited("unknown")).toBe(false);
    }
    expect(isCheckoutRateLimited("")).toBe(false);
  });
});
