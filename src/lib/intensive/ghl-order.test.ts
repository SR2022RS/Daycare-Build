import { describe, expect, it } from "vitest";

import { INTENSIVE } from "./config";
import { isIntensiveOrder } from "./ghl-order";

/**
 * The webhook runs this on every GHL order, and the account sells digital
 * products alongside the class. These are the cases that decide whether a
 * checklist buyer gets registered for -- and emailed about -- the class.
 */

const seat = {
  name: "The Daycare Owner Intensive - Intensive Seat",
  productId: INTENSIVE.ghlProductId,
  priceId: "6a89f7782d65c6a1bd0646d7",
};
const checklist = {
  name: "Daycare Start-Up Checklist",
  productId: "6a96c1c4ffc060b6a373fb2e",
  priceId: "checklist-price",
};

describe("isIntensiveOrder", () => {
  it("accepts a class seat", () => {
    expect(isIntensiveOrder({ items: [seat] })).toBe(true);
  });

  it("rejects a digital product from the shop funnel", () => {
    expect(isIntensiveOrder({ items: [checklist] })).toBe(false);
  });

  it("accepts an order that includes a seat alongside other items", () => {
    expect(isIntensiveOrder({ items: [checklist, seat] })).toBe(true);
  });

  it("rejects a look-alike name once product ids are present", () => {
    const lookalike = {
      ...checklist,
      name: "Daycare Owner Intensive Workbook",
    };
    expect(isIntensiveOrder({ items: [lookalike] })).toBe(false);
  });

  it("falls back to the name only when GHL sent no product ids", () => {
    expect(isIntensiveOrder({ items: [{ ...seat, productId: null }] })).toBe(
      true,
    );
    expect(
      isIntensiveOrder({ items: [{ ...checklist, productId: null }] }),
    ).toBe(false);
  });

  it("rejects an order with no line items", () => {
    // What a list-endpoint row looks like before it is re-fetched.
    expect(isIntensiveOrder({ items: [] })).toBe(false);
  });
});
