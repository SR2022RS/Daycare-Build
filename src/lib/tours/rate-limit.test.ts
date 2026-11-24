import { describe, expect, it } from "vitest";

import { isTourRateLimited } from "./rate-limit";

describe("isTourRateLimited", () => {
  it("allows a few requests from one address", () => {
    const ip = "198.51.100.10";
    for (let i = 0; i < 5; i++) expect(isTourRateLimited(ip)).toBe(false);
  });

  it("trips on the next request", () => {
    const ip = "198.51.100.11";
    for (let i = 0; i < 5; i++) isTourRateLimited(ip);
    expect(isTourRateLimited(ip)).toBe(true);
  });

  it("does not share a bucket with another address", () => {
    const noisy = "198.51.100.12";
    for (let i = 0; i < 10; i++) isTourRateLimited(noisy);
    expect(isTourRateLimited("198.51.100.13")).toBe(false);
  });

  it("does not limit a missing address", () => {
    for (let i = 0; i < 20; i++) expect(isTourRateLimited("unknown")).toBe(false);
    expect(isTourRateLimited("")).toBe(false);
  });
});
