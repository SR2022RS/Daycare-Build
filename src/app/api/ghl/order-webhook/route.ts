import { timingSafeEqual } from "node:crypto";

import { INTENSIVE, buildIcs } from "@/lib/intensive/config";
import {
  confirmationHtml,
  confirmationSubject,
} from "@/lib/intensive/reminders";
import { sendEmail } from "@/lib/email/resend";
import {
  INTENSIVE_TAG,
  NEXT_COHORT_TAG,
  fetchOrder,
  fetchContact,
  findRecentPaidOrder,
  upsertIntensiveContact,
  type GhlOrder,
} from "@/lib/ghl/client";
import { isIntensiveOrder } from "@/lib/intensive/ghl-order";
import { isWaitlist } from "@/lib/intensive/config";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

/**
 * GoHighLevel order webhook -- the GHL-side counterpart to the Stripe webhook,
 * and the only thing allowed to create a paid seat on the hosted-checkout path.
 *
 * Called by a GHL workflow ("Order Submitted" / "Payment Received" -> Custom
 * Webhook). Two things make that safe to expose publicly:
 *
 *   1. A shared secret, because GHL does not sign its workflow webhooks. Any
 *      unsigned POST to a public URL is anonymous by definition, so without
 *      this anyone who guessed the path could mint free seats.
 *   2. Re-reading the order from GHL's API. Even an authenticated caller only
 *      gets to say WHICH order to look at; whether it was paid, and for how
 *      much, is read from GHL directly. This is the same reasoning the Stripe
 *      webhook applies when it re-retrieves the session rather than trusting
 *      the delivered payload.
 *
 * Idempotent by construction: the unique index on checkout_session_id means a
 * redelivered webhook updates the same row instead of booking a second seat.
 */

export const dynamic = "force-dynamic";

type InsertRow =
  Database["public"]["Tables"]["intensive_registrations"]["Insert"];

/** GHL spells the order id differently depending on which trigger fired. */
const ORDER_ID_KEYS = [
  "orderId",
  "order_id",
  "id",
  "_id",
  "transactionId",
  "transaction_id",
];

export async function POST(request: Request) {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    // 500 rather than 200: this is our misconfiguration, and GHL retries a
    // 5xx once the environment is fixed instead of dropping the order.
    console.error("[ghl-webhook] GHL_WEBHOOK_SECRET is not set");
    return new Response("Webhook not configured", { status: 500 });
  }

  if (!isAuthorized(request, secret)) {
    console.error("[ghl-webhook] rejected an unauthenticated call");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Expected JSON", { status: 400 });
  }

  // ?dryRun=1 resolves and judges the order exactly as a real delivery would,
  // then reports the decision without writing a row, emailing anyone or
  // tagging anyone. It exists so a missed buyer can be diagnosed -- and a fix
  // proven -- without sending a real customer a duplicate email.
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const decide = (outcome: Record<string, unknown>) =>
    Response.json({ received: true, dryRun, ...outcome });

  // Try every id the body might carry, then fall back to looking the order up
  // by contact. GHL's default webhook body contains contact fields and no
  // order id, so `id` is usually the CONTACT's id -- resolving it as an order
  // fails, and without the fallback a default-configured webhook would never
  // seat anybody.
  let order: GhlOrder | null = null;
  for (const candidate of findOrderIds(payload)) {
    order = await fetchOrder(candidate);
    if (order) break;
  }

  if (!order) {
    order = await findRecentPaidOrder({
      contactId: stringField(payload, ["contactId", "contact_id", "id"]),
      email: stringField(payload, ["email", "contact_email"]),
      // A contact may have bought the $25 checklist as well as a seat. Only
      // the seat counts here.
      accept: isIntensiveOrder,
    });
  }

  if (!order) {
    // Nothing resolvable. 200 rather than a retry: re-delivering the same body
    // will keep producing the same nothing, and a stuck queue hides real
    // failures behind noise.
    console.error(
      "[ghl-webhook] could not resolve an order; keys:",
      Object.keys(payload).join(","),
    );
    return decide({ ignored: "no resolvable order" });
  }

  // "Order Submitted" fires for every order in the sub-account, including the
  // digital products sold from shop.akpadaycareblueprint.com. Without this, a
  // $25 checklist buyer would be registered for the in-person class and sent
  // its confirmation email.
  if (!isIntensiveOrder(order)) {
    console.log(
      `[ghl-webhook] order ${order.id} is not for the Intensive; not seating`,
    );
    return decide({ ignored: "not an Intensive order", orderId: order.id });
  }

  // A test-mode purchase must not put anybody on the real attendee list. This
  // is off by default and switched on deliberately (INTENSIVE_ALLOW_TEST_ORDERS=1)
  // only while verifying the chain end to end -- otherwise a stray test payment
  // months from now would quietly seat a person who never paid.
  //
  // Note the explicit `=== false`: an order whose mode GHL did not report is
  // null, and null must fall through as live. See readLiveMode in ghl/client.
  if (
    order.liveMode === false &&
    process.env.INTENSIVE_ALLOW_TEST_ORDERS !== "1"
  ) {
    console.log(
      `[ghl-webhook] order ${order.id} is a TEST payment; not seating`,
    );
    return decide({ ignored: "test-mode order", orderId: order.id });
  }

  if (order.status !== "paid" && order.status !== "completed") {
    console.log(
      `[ghl-webhook] order ${order.id} is "${order.status}"; not seating`,
    );
    return decide({ ignored: order.status, orderId: order.id });
  }

  // Some GHL responses carry no customer snapshot. Fall back to the contact
  // record -- still GHL's own data, never the unsigned webhook body.
  if (!order.email && order.contactId) {
    const contact = await fetchContact(order.contactId);
    if (contact) {
      order = {
        ...order,
        email: contact.email,
        firstName: order.firstName ?? contact.firstName,
        lastName: order.lastName ?? contact.lastName,
      };
    }
  }

  if (!order.email) {
    console.error(
      `[ghl-webhook] order ${order.id} is paid but carries no email`,
    );
    return decide({ ignored: "no email", orderId: order.id });
  }

  const row: InsertRow = {
    tenant_id: INTENSIVE.tenantId,
    // Which session this seat is for. "next" while no date is set, so these
    // buyers are never mixed in with the people who attended Sept 12.
    cohort: INTENSIVE.cohort,
    first_name: order.firstName || "Unknown",
    last_name: order.lastName || "",
    email: order.email,
    // GHL reports major units (300), the column stores cents (30000).
    // Math.round, not a bare multiply: 29.99 * 100 is 2998.9999999999995.
    amount_cents: Math.round(order.amount * 100),
    currency: order.currency,
    status: "paid",
    checkout_session_id: `ghl_${order.id}`,
    payment_intent_id: null,
  };

  if (dryRun) {
    return decide({
      wouldSeat: true,
      orderId: order.id,
      email: row.email,
      name: `${row.first_name} ${row.last_name}`.trim(),
      amountCents: row.amount_cents,
    });
  }

  // insert, not upsert. A second delivery for the same order -- a retry, or
  // the same buyer later buying a checklist, which fires this workflow again
  // and resolves back to their seat -- must not email the confirmation twice.
  // The unique index on checkout_session_id turns that second attempt into a
  // 23505, which is the "already recorded" signal.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("intensive_registrations")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    console.log(
      `[ghl-webhook] order ${order.id} already recorded; no side effects`,
    );
    return Response.json({ received: true, duplicate: true });
  }

  if (error) {
    console.error(
      `[ghl-webhook] registration upsert failed for ${order.id}: ${error.message}`,
    );
    return new Response("Handler error", { status: 500 });
  }

  console.log(`[ghl-webhook] order ${order.id} recorded as paid (${data?.id})`);

  // Side effects are deliberately not allowed to fail the webhook: the seat is
  // paid and recorded, and a retry would not fix an email or CRM outage.
  await sendEmail({
    to: row.email,
    from: INTENSIVE.fromEmail,
    replyTo: INTENSIVE.contactEmail,
    subject: confirmationSubject,
    html: confirmationHtml({
      firstName: row.first_name,
      amountCents: row.amount_cents,
      currency: row.currency ?? "usd",
    }),
    // No calendar file while the next date is unknown -- an .ics can only carry
    // the session that has already happened.
    ...(isWaitlist
      ? {}
      : {
          attachments: [
            {
              filename: "daycare-owner-intensive.ics",
              content: buildIcs(),
              contentType: "text/calendar; charset=utf-8; method=PUBLISH",
            },
          ],
        }),
  }).catch((sendError) => {
    console.error(
      `[ghl-webhook] confirmation email failed for ${order.id}`,
      sendError,
    );
  });

  // Promote them from "started paying" to the buyer tag. Tags are additive on
  // upsert, so the payment-started tag stays as an audit trail.
  const tagged = await upsertIntensiveContact({
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    tag: isWaitlist ? NEXT_COHORT_TAG : INTENSIVE_TAG,
  });
  if (!tagged.ok) {
    console.error(
      `[ghl-webhook] buyer tag failed for ${order.id}: ${tagged.error}`,
    );
  }

  return Response.json({ received: true });
}

/**
 * Accepts the secret as a bearer token or as `?token=`.
 *
 * Both, because GHL's workflow webhook builder has not always exposed custom
 * headers; the query form is the fallback that always works. It is weaker --
 * URLs leak into logs -- so the header is preferred where available.
 */
function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const query = new URL(request.url).searchParams.get("token") ?? "";

  return (
    constantTimeEquals(bearer, secret) || constantTimeEquals(query, secret)
  );
}

/** Compares without leaking length or position through timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Every id in the body that could plausibly be an order, best guess first. */
function findOrderIds(payload: Record<string, unknown>): string[] {
  // Workflow payloads sometimes nest the order under `order` or `customData`.
  const scopes: Record<string, unknown>[] = [payload];
  for (const key of ["order", "customData", "data"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object")
      scopes.push(nested as Record<string, unknown>);
  }

  const found: string[] = [];
  for (const scope of scopes) {
    for (const key of ORDER_ID_KEYS) {
      const value = scope[key];
      if (
        typeof value === "string" &&
        value.trim() &&
        !found.includes(value.trim())
      ) {
        found.push(value.trim());
      }
    }
  }
  return found;
}

/** First non-empty string among `keys`, searched at the top level and one deep. */
function stringField(
  payload: Record<string, unknown>,
  keys: string[],
): string | null {
  const scopes: Record<string, unknown>[] = [payload];
  for (const key of ["order", "customData", "data", "contact"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object")
      scopes.push(nested as Record<string, unknown>);
  }
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}
