import { describe, expect, it } from "vitest";

import { WaitlistSchema } from "./definitions";

/**
 * The waitlist form is public and unauthenticated, so this schema is the only
 * thing standing between the list and whatever gets posted at it.
 */

const valid = {
  firstName: "Shonda",
  lastName: "Pearson",
  email: "shonda@example.com",
};

describe("WaitlistSchema", () => {
  it("accepts a complete signup", () => {
    expect(WaitlistSchema.safeParse(valid).success).toBe(true);
  });

  it("trims surrounding whitespace rather than storing it", () => {
    const parsed = WaitlistSchema.parse({
      firstName: "  Shonda ",
      lastName: " Pearson  ",
      email: "  shonda@example.com ",
    });
    expect(parsed).toEqual(valid);
  });

  it("rejects a name that is only whitespace", () => {
    expect(
      WaitlistSchema.safeParse({ ...valid, firstName: "   " }).success,
    ).toBe(false);
  });

  it("rejects an address that is not an email", () => {
    expect(
      WaitlistSchema.safeParse({ ...valid, email: "shonda at example" })
        .success,
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(WaitlistSchema.safeParse({ email: valid.email }).success).toBe(
      false,
    );
  });

  it("caps absurdly long input", () => {
    expect(
      WaitlistSchema.safeParse({ ...valid, firstName: "a".repeat(81) }).success,
    ).toBe(false);
    expect(
      WaitlistSchema.safeParse({
        ...valid,
        email: `${"a".repeat(200)}@example.com`,
      }).success,
    ).toBe(false);
  });
});
