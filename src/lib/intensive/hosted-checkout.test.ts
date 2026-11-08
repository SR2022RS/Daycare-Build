import { afterEach, describe, expect, it } from "vitest";

import { hostedCheckoutUrl, withBuyerPrefill } from "./hosted-checkout";

const BUYER = { firstName: "Dana", lastName: "Okoye", email: "dana@example.com" };

afterEach(() => {
  delete process.env.INTENSIVE_PAYMENT_URL;
});

describe("hostedCheckoutUrl", () => {
  it("is null when unset, so the Stripe API path stays in charge", () => {
    expect(hostedCheckoutUrl()).toBeNull();
  });

  it("rejects http, rather than sending a buyer to a plaintext payment page", () => {
    process.env.INTENSIVE_PAYMENT_URL = "http://pay.example.com/intensive";
    expect(hostedCheckoutUrl()).toBeNull();
  });

  it("rejects a value that is not a URL at all", () => {
    process.env.INTENSIVE_PAYMENT_URL = "coming soon";
    expect(hostedCheckoutUrl()).toBeNull();
  });

  it("accepts an https URL", () => {
    process.env.INTENSIVE_PAYMENT_URL = "https://pay.example.com/intensive";
    expect(hostedCheckoutUrl()).toBe("https://pay.example.com/intensive");
  });
});

describe("withBuyerPrefill", () => {
  it("uses Stripe's single prefill parameter on a payment link", () => {
    const url = new URL(withBuyerPrefill("https://buy.stripe.com/abc123", BUYER));
    expect(url.searchParams.get("prefilled_email")).toBe("dana@example.com");
    // Stripe rejects unknown params on payment links, so nothing else may ride along.
    expect(url.searchParams.get("first_name")).toBeNull();
  });

  it("uses name and email parameters on a GHL order form", () => {
    const url = new URL(withBuyerPrefill("https://link.akpa.com/intensive", BUYER));
    expect(url.searchParams.get("email")).toBe("dana@example.com");
    expect(url.searchParams.get("first_name")).toBe("Dana");
    expect(url.searchParams.get("last_name")).toBe("Okoye");
  });

  it("keeps query parameters the funnel link already carried", () => {
    const url = new URL(withBuyerPrefill("https://link.akpa.com/intensive?step=2", BUYER));
    expect(url.searchParams.get("step")).toBe("2");
    expect(url.searchParams.get("email")).toBe("dana@example.com");
  });
});
