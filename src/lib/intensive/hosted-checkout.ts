import "server-only";

/**
 * Hosted checkout: send the buyer to a payment page somebody else hosts.
 *
 * This exists because the Stripe *API* path (lib/intensive/actions.ts ->
 * stripe.checkout.sessions.create) needs a live secret key living in the
 * environment, and that key is the single thing that took production down:
 * a restricted key that could not create sessions returned 401 to every
 * buyer. A hosted page removes the credential from the critical path
 * entirely -- the URL is public, so nothing here is a secret and nothing
 * here can expire or be scoped wrong.
 *
 * Deliberately provider-agnostic. The same code points at a Stripe Payment
 * Link (buy.stripe.com/...) or a GoHighLevel order form, because the only
 * thing the funnel actually needs is "a URL that takes $300 and knows who
 * the buyer is".
 *
 * Trade-off worth naming: a hosted page means WE no longer create the
 * Checkout Session, so we no longer control its metadata. Fulfilment
 * therefore leans on the GHL contact we write BEFORE the redirect (see
 * actions.ts) rather than on session metadata coming back through the
 * webhook.
 */

/** Configured payment page, or null when the API path should be used instead. */
export function hostedCheckoutUrl(): string | null {
  const raw = process.env.INTENSIVE_PAYMENT_URL?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    console.error("[intensive] INTENSIVE_PAYMENT_URL is not a valid URL; ignoring it");
    return null;
  }

  // http would downgrade a payment page to plaintext. Refuse rather than
  // silently send a buyer somewhere their card details are readable.
  if (parsed.protocol !== "https:") {
    console.error("[intensive] INTENSIVE_PAYMENT_URL must be https; ignoring it");
    return null;
  }

  return parsed.toString();
}

export function isHostedCheckoutConfigured(): boolean {
  return hostedCheckoutUrl() !== null;
}

/**
 * Adds the buyer's details to the payment URL so they don't retype what they
 * just typed. Every provider spells these differently, so the parameter names
 * are chosen by host.
 *
 * Existing query parameters on the configured URL are preserved -- GHL order
 * form links routinely carry their own, and dropping them would break the
 * page rather than just the prefill.
 */
export function withBuyerPrefill(
  url: string,
  buyer: { firstName: string; lastName: string; email: string },
): string {
  const target = new URL(url);
  const host = target.hostname;

  if (host === "buy.stripe.com" || host.endsWith(".stripe.com")) {
    // Stripe Payment Links accept exactly one prefill parameter, and only
    // when the link was not created with a fixed customer.
    target.searchParams.set("prefilled_email", buyer.email);
    return target.toString();
  }

  // GoHighLevel order forms (and its funnel domains) read these.
  target.searchParams.set("email", buyer.email);
  target.searchParams.set("first_name", buyer.firstName);
  target.searchParams.set("last_name", buyer.lastName);
  // GHL's own builder uses these spellings in places; harmless where unread.
  target.searchParams.set("firstName", buyer.firstName);
  target.searchParams.set("lastName", buyer.lastName);
  return target.toString();
}
