import "server-only";

import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe/client";

/**
 * Which product a Checkout Session belongs to.
 *
 * One Stripe account serves two unrelated things: the public $300 Daycare
 * Owner Intensive, and (soon) tuition billing for the childcare portal. Both
 * subscribe to `checkout.session.completed`, so every webhook MUST establish
 * that an event is its own before acting on it.
 *
 * Without this, the intensive webhook records a course registration for every
 * event on the account -- meaning the first parent to pay tuition would be
 * booked onto the course and emailed a confirmation with a calendar invite.
 *
 * The contract for every webhook in this codebase: not mine -> return 200 and
 * do nothing. Never a 5xx, which would make Stripe redeliver another
 * product's event forever.
 */

/** Set on sessions created by `startRegistration`. */
export const INTENSIVE_PRODUCT_MARKER = "intensive";

/** Reserved for the tuition webhook, so both sides agree on the vocabulary. */
export const TUITION_PRODUCT_MARKER = "tuition";

export type SessionOwner = "intensive" | "other";

/**
 * Decides whether a session is an Intensive purchase.
 *
 * Three signals, cheapest first:
 *   1. mode === "payment" -- tuition will use invoices/subscriptions.
 *   2. metadata.product === "intensive" -- explicit, set at creation.
 *   3. the line item's price id equals STRIPE_PRICE_ID -- authoritative,
 *      and the only check that works for sessions created before the marker
 *      existed. Those already exist and are paid, so the marker alone cannot
 *      be required.
 *
 * A session passes on (1 AND 2) OR (1 AND 3). The line-item lookup is an
 * extra API call, so it only runs when the marker is absent.
 */
export async function classifySession(session: Stripe.Checkout.Session): Promise<SessionOwner> {
  if (session.mode !== "payment") return "other";

  const marker = session.metadata?.product;
  if (marker === INTENSIVE_PRODUCT_MARKER) return "intensive";
  // An explicit foreign marker is decisive -- no need to spend an API call.
  if (marker && marker !== INTENSIVE_PRODUCT_MARKER) return "other";

  const expectedPrice = process.env.STRIPE_PRICE_ID;
  if (!expectedPrice) {
    // Can't prove ownership. Refusing is the safe default: a missed course
    // registration is recoverable from the Stripe dashboard, a tuition
    // payment wrongly booked as a course seat is not.
    console.error("[stripe-routing] STRIPE_PRICE_ID unset; cannot classify session");
    return "other";
  }

  const stripe = getStripe();
  if (!stripe) return "other";

  try {
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
    const [only] = items.data;
    if (items.data.length !== 1 || !only) return "other";

    const priceId = typeof only.price === "string" ? only.price : only.price?.id;
    return priceId === expectedPrice ? "intensive" : "other";
  } catch (error) {
    // Treat an unreadable session as foreign rather than assuming it is ours.
    console.error(`[stripe-routing] line-item lookup failed for ${session.id}`, error);
    return "other";
  }
}

export async function isIntensiveSession(session: Stripe.Checkout.Session): Promise<boolean> {
  return (await classifySession(session)) === "intensive";
}
