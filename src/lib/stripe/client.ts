import "server-only";

import Stripe from "stripe";

/**
 * Stripe API version this integration is written against. Pinned on purpose:
 * Stripe ships breaking changes behind version strings, so an unpinned client
 * silently changes shape the day the account's default version moves.
 */
export const STRIPE_API_VERSION = "2026-07-29.dahlia";

/**
 * Returns a StripeClient, or null when the key is absent.
 *
 * Null rather than throwing: /intensive is a public marketing page that must
 * still render when payments are not configured. Callers decide what an
 * unconfigured environment means -- the checkout reports "not open yet", the
 * webhook rejects the request.
 *
 * A fresh client per call rather than a module-level singleton: under Fluid
 * Compute an instance is reused across concurrent requests, and this is the
 * same reasoning proxy.ts documents for the Supabase client.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    typescript: true,
    // ASCII only: appInfo goes into the User-Agent header, and a non-ASCII
    // character there (an em dash, a smart quote) makes every request throw
    // "Invalid character in header content" before it leaves the process.
    appInfo: { name: "AKPA University - Daycare Owner Intensive" },
  });
}

/** True only when both halves of the configuration are present. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && Boolean(process.env.STRIPE_PRICE_ID);
}
