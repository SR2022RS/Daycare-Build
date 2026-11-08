import { describe, expect, it } from "vitest";

import { normalizeOrder } from "./client";

/**
 * Shapes taken from real GHL responses for the class's first paid order
 * (Aug 29, 2026). The list-row case is the one that silently dropped that
 * buyer: the order was found, paid and live, but the list endpoint carries no
 * customer email and no line items.
 */

describe("normalizeOrder", () => {
  it("reads a full order with populated product and price refs", () => {
    const order = normalizeOrder({
      _id: "6a9313c07bb76cb9c0e8be9b",
      status: "completed",
      amount: 300,
      currency: "USD",
      liveMode: true,
      contactId: "ZayP9oSg1UCDmeGaBeMQ",
      contactSnapshot: {
        email: "buyer@example.com",
        firstName: "Shonda",
        lastName: "Pearson",
      },
      items: [
        {
          name: "The Daycare Owner Intensive - Intensive Seat",
          product: {
            _id: "6a89f7712d65c6a1bd0645e1",
            name: "The Daycare Owner Intensive",
          },
          price: { _id: "6a89f7782d65c6a1bd0646d7", amount: 300 },
        },
      ],
    });

    expect(order).toMatchObject({
      id: "6a9313c07bb76cb9c0e8be9b",
      status: "completed",
      amount: 300,
      liveMode: true,
      email: "buyer@example.com",
      contactId: "ZayP9oSg1UCDmeGaBeMQ",
      items: [
        {
          name: "The Daycare Owner Intensive - Intensive Seat",
          productId: "6a89f7712d65c6a1bd0645e1",
          priceId: "6a89f7782d65c6a1bd0646d7",
        },
      ],
    });
  });

  it("reads bare-id product and price refs", () => {
    const order = normalizeOrder({
      _id: "o1",
      items: [{ name: "Seat", product: "prod_1", price: "price_1" }],
    });
    expect(order?.items).toEqual([
      { name: "Seat", productId: "prod_1", priceId: "price_1" },
    ]);
  });

  it("a list-endpoint row has no email and no items -- so the search path re-fetches", () => {
    const order = normalizeOrder({
      _id: "6a9313c07bb76cb9c0e8be9b",
      status: "completed",
      amount: 300,
      liveMode: true,
      contactId: "ZayP9oSg1UCDmeGaBeMQ",
    });
    expect(order?.email).toBeNull();
    expect(order?.items).toEqual([]);
    expect(order?.contactId).toBe("ZayP9oSg1UCDmeGaBeMQ");
  });
});
