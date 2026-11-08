import "server-only";

/**
 * Minimal GoHighLevel client for the intensive funnel.
 *
 * Scope is deliberately small: push a paid registrant into the AKPA
 * subaccount as a tagged contact so Shikara has a real list to follow up
 * and market the next cohort to. Nothing here is load-bearing for payment.
 *
 * Auth is a location-scoped Private Integration Token. The token alone is
 * not enough -- every call needs the locationId, and the API offers no way
 * to ask a PIT which location it belongs to, so both must be configured.
 */

const API = "https://services.leadconnectorhq.com";

/** GHL pins breaking changes behind this header; unset means "oldest". */
const GHL_API_VERSION = "2021-07-28";

/** Tag applied to every buyer, so the cohort is segmentable in GHL. */
export const INTENSIVE_TAG = "daycare-owner-intensive-2026-09";

/**
 * Applied when checkout itself failed. Kept distinct from INTENSIVE_TAG so a
 * rescued lead is never mistaken for a paid seat -- these people owe money
 * and need calling; buyers do not.
 */
export const CHECKOUT_FAILED_TAG = "daycare-intensive-checkout-failed";

/**
 * Applied to somebody who asked to hear about the next session. They have
 * paid nothing and committed to nothing -- kept well away from INTENSIVE_TAG
 * so a waitlist name can never be mistaken for a paid seat when the next
 * cohort is marketed to.
 */
export const WAITLIST_TAG = "daycare-owner-intensive-waitlist";

/**
 * A paid seat bought after the September session, for a date that has not
 * been announced yet.
 *
 * Kept apart from INTENSIVE_TAG, which names the September cohort: marketing
 * the next class must not mail the people who already attended, and chasing
 * September's attendees must not mail people who have already paid for the
 * next one.
 */
export const NEXT_COHORT_TAG = "daycare-owner-intensive-next";

/**
 * Applied the moment someone is sent to a hosted payment page, before any
 * money moves. On the hosted-checkout path we do not create the Checkout
 * Session ourselves, so this contact is the only record that a given person
 * started paying -- it is what makes an abandoned cart visible at all.
 *
 * Distinct from INTENSIVE_TAG on purpose: this means "tried to pay", never
 * "paid". Only the payment webhook may promote someone to a paid seat.
 */
export const PAYMENT_STARTED_TAG = "daycare-intensive-payment-started";

export interface GhlResult {
  ok: boolean;
  contactId?: string;
  error?: string;
}

function credentials(): { token: string; locationId: string } | null {
  const token = process.env.GHL_PIT_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) return null;
  return { token, locationId };
}

export function isGhlConfigured(): boolean {
  return credentials() !== null;
}

/**
 * Creates or updates the contact by email.
 *
 * Uses /contacts/upsert rather than create: the subaccount treats email as
 * a unique identifier, so a repeat buyer (or a webhook redelivery) updates
 * the existing record instead of erroring or duplicating them.
 *
 * Never throws. A CRM outage must not fail the payment webhook -- the seat
 * is already paid and recorded in our own database, which is the record
 * that matters.
 */
export async function upsertIntensiveContact(params: {
  firstName: string;
  lastName: string;
  email: string;
  /** Defaults to the buyer tag; pass CHECKOUT_FAILED_TAG for rescued leads. */
  tag?: string;
}): Promise<GhlResult> {
  const creds = credentials();
  if (!creds) return { ok: false, error: "GHL not configured" };

  try {
    const response = await fetch(`${API}/contacts/upsert`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        Version: GHL_API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locationId: creds.locationId,
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        // Tags are additive on upsert, so an existing contact keeps whatever
        // segments they were already in.
        tags: [params.tag ?? INTENSIVE_TAG],
        source: "Daycare Owner Intensive funnel",
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${body.slice(0, 200)}` };
    }

    const data = JSON.parse(body) as { contact?: { id?: string } };
    return { ok: true, contactId: data.contact?.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface GhlOrder {
  id: string;
  /** GHL's own order status, lowercased. "paid" is the only one that seats. */
  status: string;
  /** Major units as GHL reports them (300 means $300), converted by callers. */
  amount: number;
  currency: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  contactId: string | null;
  /**
   * Whether the payment was real money. null when GHL did not say -- treated
   * as live, because refusing to seat a paying customer over a missing field
   * is the worse of the two mistakes.
   */
  liveMode: boolean | null;
  /**
   * What was bought. Only the single-order endpoint returns these -- the list
   * endpoint omits line items (and the customer's email), which is why the
   * search path re-fetches each candidate before deciding anything.
   */
  items: GhlOrderItem[];
}

export interface GhlOrderItem {
  name: string;
  productId: string | null;
  priceId: string | null;
}

/**
 * Reads an order back from GHL.
 *
 * This is the trust anchor for the order webhook, and the direct analogue of
 * the Stripe webhook re-fetching its session: a GHL workflow webhook is an
 * unsigned POST to a public URL, so its body proves nothing on its own. The
 * body is treated purely as a pointer -- "look at order X" -- and every fact
 * that decides whether somebody gets a paid seat is read from here instead.
 *
 * Returns null when the order cannot be read, which callers must treat as
 * "do not seat", never as "not paid".
 */
export async function fetchOrder(orderId: string): Promise<GhlOrder | null> {
  const creds = credentials();
  if (!creds) return null;

  try {
    const url = new URL(
      `${API}/payments/orders/${encodeURIComponent(orderId)}`,
    );
    url.searchParams.set("altId", creds.locationId);
    url.searchParams.set("altType", "location");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[ghl] order ${orderId} lookup failed: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    // Shared with the search path so a field only has to be understood once.
    return normalizeOrder(data) ?? normalizeOrder({ ...data, _id: orderId });
  } catch (error) {
    console.error(`[ghl] order ${orderId} lookup threw`, error);
    return null;
  }
}

/**
 * Finds the most recent paid order for a contact.
 *
 * The fallback path for the order webhook. GoHighLevel's default custom-webhook
 * body sends contact fields -- `{{contact.id}}`, `{{contact.email}}` -- and no
 * order id at all, so a webhook left on its defaults gives us a person rather
 * than a purchase. Rather than depend on somebody hand-editing the body with a
 * merge field whose spelling varies by trigger, we look the order up ourselves.
 *
 * Safe because it is still GHL's own record of payment that decides the
 * outcome: this only changes WHICH order we read, never whether it counts.
 * Scoped to paid orders so an abandoned or failed one can never seat anybody.
 */
export async function findRecentPaidOrder(params: {
  contactId?: string | null;
  email?: string | null;
  /** Only return an order this accepts -- e.g. "is a seat at the class". */
  accept?: (order: GhlOrder) => boolean;
}): Promise<GhlOrder | null> {
  const creds = credentials();
  if (!creds) return null;
  if (!params.contactId && !params.email) return null;

  try {
    const url = new URL(`${API}/payments/orders`);
    url.searchParams.set("altId", creds.locationId);
    url.searchParams.set("altType", "location");
    url.searchParams.set("limit", "20");
    if (params.contactId) url.searchParams.set("contactId", params.contactId);
    else if (params.email) url.searchParams.set("search", params.email);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      console.error(`[ghl] order search failed: ${response.status}`);
      return null;
    }

    const body = (await response.json()) as { data?: unknown[] };
    const rows = Array.isArray(body.data) ? body.data : [];

    const wanted = params.email?.trim().toLowerCase();
    for (const raw of rows) {
      const listed = normalizeOrder(raw as Record<string, unknown>);
      if (!listed) continue;
      if (listed.status !== "paid" && listed.status !== "completed") continue;

      // The list endpoint omits the customer's email and the line items, so
      // decide on the full record. Deciding on the list row is what silently
      // dropped the first real buyer: her order was found, paid and live, but
      // carried no email, and the webhook skipped it as "no email".
      const order = (await fetchOrder(listed.id)) ?? listed;

      // When we only had an email to go on, make sure the row is actually theirs
      // -- `search` is a fuzzy match and could return somebody else's order.
      if (!params.contactId && wanted && order.email?.toLowerCase() !== wanted)
        continue;
      if (params.accept && !params.accept(order)) continue;
      return order;
    }
    return null;
  } catch (error) {
    console.error("[ghl] order search threw", error);
    return null;
  }
}

/** Shared shape-mapping for an order, whether fetched by id or by search. */
export function normalizeOrder(data: Record<string, unknown>): GhlOrder | null {
  const id = typeof data._id === "string" ? data._id : null;
  if (!id) return null;
  const contact = (data.contactSnapshot ?? {}) as {
    email?: string;
    firstName?: string;
    lastName?: string;
    id?: string;
  };
  return {
    id,
    liveMode: readLiveMode(data),
    status: String(data.status ?? "").toLowerCase(),
    amount: typeof data.amount === "number" ? data.amount : 0,
    currency: String(data.currency ?? "USD").toLowerCase(),
    email: contact.email ?? null,
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    contactId:
      contact.id ??
      (typeof data.contactId === "string" ? data.contactId : null),
    items: readItems(data.items),
  };
}

function readItems(raw: unknown): GhlOrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return [
      {
        name: typeof item.name === "string" ? item.name : "",
        productId: refId(item.product),
        priceId: refId(item.price),
      },
    ];
  });
}

/** GHL returns a related record either populated (`{ _id, ... }`) or as a bare id. */
function refId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const id = (value as { _id?: unknown })._id;
    if (typeof id === "string") return id;
  }
  return null;
}

/**
 * GoHighLevel spells "was this real money" several ways depending on which
 * endpoint answered, so check all of them rather than trusting one.
 *
 * Returns null when nothing says. Callers treat that as live: a test order
 * wrongly seated is a row we can delete, but a real buyer wrongly refused a
 * seat is a customer who paid and got nothing.
 */
export function readLiveMode(data: Record<string, unknown>): boolean | null {
  for (const key of ["liveMode", "livemode", "isLive"]) {
    const value = data[key];
    if (typeof value === "boolean") return value;
  }
  for (const key of ["paymentMode", "mode"]) {
    const value = data[key];
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (normalized === "live") return true;
      if (normalized === "test") return false;
    }
  }
  return null;
}

export interface GhlContact {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Reads a contact's name and email.
 *
 * The fallback for an order that arrives without a customer snapshot. The
 * email still comes from GHL's own record -- never from the webhook body,
 * which proves nothing on its own.
 */
export async function fetchContact(
  contactId: string,
): Promise<GhlContact | null> {
  const creds = credentials();
  if (!creds) return null;

  try {
    const response = await fetch(
      `${API}/contacts/${encodeURIComponent(contactId)}`,
      {
        headers: {
          Authorization: `Bearer ${creds.token}`,
          Version: GHL_API_VERSION,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      console.error(
        `[ghl] contact ${contactId} lookup failed: ${response.status}`,
      );
      return null;
    }

    const body = (await response.json()) as {
      contact?: Record<string, unknown>;
    };
    const contact = body.contact ?? {};
    const text = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    return {
      email: text(contact.email),
      firstName: text(contact.firstName),
      lastName: text(contact.lastName),
    };
  } catch (error) {
    console.error(`[ghl] contact ${contactId} lookup threw`, error);
    return null;
  }
}
