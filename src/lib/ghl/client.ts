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
        tags: [INTENSIVE_TAG],
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
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
