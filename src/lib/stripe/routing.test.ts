import { afterEach, describe, expect, it, vi } from "vitest";

import { INTENSIVE_PRODUCT_MARKER, classifySession } from "./routing";

/**
 * These cover the paths that decide ownership WITHOUT calling Stripe. That is
 * deliberate: the marker and mode checks are what will run for every real
 * session once the marker ships, and they are the last line of defence
 * stopping a tuition payment being recorded as a course seat.
 */

// Minimal shape -- classifySession only reads mode, metadata and id.
function session(overrides: Record<string, unknown> = {}) {
  return { id: "cs_test_123", mode: "payment", metadata: {}, ...overrides } as never;
}

const originalPriceId = process.env.STRIPE_PRICE_ID;

afterEach(() => {
  if (originalPriceId === undefined) delete process.env.STRIPE_PRICE_ID;
  else process.env.STRIPE_PRICE_ID = originalPriceId;
  vi.restoreAllMocks();
});

describe("classifySession", () => {
  it("claims a session carrying the intensive marker", async () => {
    const result = await classifySession(session({ metadata: { product: INTENSIVE_PRODUCT_MARKER } }));
    expect(result).toBe("intensive");
  });

  it("disowns a session marked as another product", async () => {
    const result = await classifySession(session({ metadata: { product: "tuition" } }));
    expect(result).toBe("other");
  });

  it("disowns anything that is not a one-off payment", async () => {
    // Tuition is expected to arrive as a subscription or invoice.
    const result = await classifySession(
      session({ mode: "subscription", metadata: { product: INTENSIVE_PRODUCT_MARKER } }),
    );
    expect(result).toBe("other");
  });

  it("refuses to claim an unmarked session when no price is configured", async () => {
    // Fail closed: a missed course registration can be recovered from the
    // Stripe dashboard, a tuition payment booked as a course seat cannot.
    delete process.env.STRIPE_PRICE_ID;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await classifySession(session({ metadata: {} }));
    expect(result).toBe("other");
  });

  it("disowns a marked-foreign session without consulting Stripe", async () => {
    // An explicit foreign marker is decisive, so no line-item lookup happens
    // even though a price id is configured.
    process.env.STRIPE_PRICE_ID = "price_intensive";
    const result = await classifySession(session({ metadata: { product: "something-else" } }));
    expect(result).toBe("other");
  });
});
