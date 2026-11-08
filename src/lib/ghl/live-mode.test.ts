import { describe, expect, it } from "vitest";

import { readLiveMode } from "./client";

describe("readLiveMode", () => {
  it("reads the boolean flags GHL sends", () => {
    expect(readLiveMode({ liveMode: true })).toBe(true);
    expect(readLiveMode({ liveMode: false })).toBe(false);
    expect(readLiveMode({ livemode: false })).toBe(false);
    expect(readLiveMode({ isLive: true })).toBe(true);
  });

  it("reads the string spellings too", () => {
    expect(readLiveMode({ paymentMode: "live" })).toBe(true);
    expect(readLiveMode({ paymentMode: "test" })).toBe(false);
    expect(readLiveMode({ mode: "TEST" })).toBe(false);
  });

  it("returns null when nothing says, so a real buyer is never refused a seat", () => {
    // The safety-critical case: the webhook only blocks on an explicit
    // `=== false`, so an unreported mode must not read as test.
    expect(readLiveMode({})).toBeNull();
    expect(readLiveMode({ status: "paid", amount: 300 })).toBeNull();
    expect(readLiveMode({ paymentMode: "something-new" })).toBeNull();
  });

  it("ignores non-boolean junk in the boolean fields", () => {
    expect(readLiveMode({ liveMode: "yes" })).toBeNull();
    expect(readLiveMode({ liveMode: 1 })).toBeNull();
  });
});
