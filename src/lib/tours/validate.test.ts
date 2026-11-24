import { describe, expect, it } from "vitest";

import { honeypotTripped, plausibleEmail, plausiblePhone } from "./validate";

describe("honeypotTripped", () => {
  it("ignores an empty field", () => {
    expect(honeypotTripped("")).toBe(false);
    expect(honeypotTripped("  ")).toBe(false);
    expect(honeypotTripped(null)).toBe(false);
  });

  it("trips when a bot fills it", () => {
    expect(honeypotTripped("https://spam.example")).toBe(true);
  });
});

describe("plausibleEmail", () => {
  it("accepts a normal address and rejects a fragment", () => {
    expect(plausibleEmail("parent@example.com")).toBe(true);
    expect(plausibleEmail("not-an-email")).toBe(false);
  });
});

describe("plausiblePhone", () => {
  it("counts digits, not punctuation", () => {
    expect(plausiblePhone("(973) 523-5318")).toBe(true);
    expect(plausiblePhone("123")).toBe(false);
  });
});
