import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { INTENSIVE } from "@/lib/intensive/config";
import { sendEmail } from "@/lib/email/resend";
import type { Database } from "@/types/database.types";

/**
 * Stripe webhook -- the only thing in this codebase allowed to create a paid
 * registration.
 *
 * The browser redirect to /intensive/confirmed is not proof of payment: a
 * buyer can close the tab, lose connection, or replay the URL. Fulfilment
 * therefore happens here and the success page only reads what this wrote.
 *
 * Handles three events, per Stripe's fulfilment guidance:
 *   checkout.session.completed        -- fires immediately; for delayed
 *                                        payment methods the session can
 *                                        still be `unpaid` at this point,
 *                                        which is why status is derived from
 *                                        payment_status rather than assumed.
 *   checkout.session.async_payment_succeeded -- the delayed payment cleared.
 *   checkout.session.async_payment_failed    -- it did not.
 *
 * Idempotent by construction: the unique index on checkout_session_id turns a
 * redelivered event into an update of the same row rather than a second seat.
 */

// Never prerender or cache: this must run per request to read the raw body.
export const dynamic = "force-dynamic";

type InsertRow = Database["public"]["Tables"]["intensive_registrations"]["Insert"];
type PaymentStatus = Database["public"]["Tables"]["intensive_registrations"]["Row"]["status"];

export async function POST(request: Request) {
  const stripe = getStripe();
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !signingSecret) {
    // 500, not 400: this is our misconfiguration, and a 5xx makes Stripe
    // retry once the environment is fixed instead of discarding the event.
    console.error("[stripe-webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing");
    return new Response("Webhook not configured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });

  // Signature verification needs the exact bytes Stripe signed, so read the
  // raw text -- parsing to JSON first would invalidate the signature.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, signingSecret);
  } catch (error) {
    // An unverified payload is untrusted input. Reject before touching it.
    console.error("[stripe-webhook] signature verification failed", error);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
        await recordSession(event.data.object, event.type);
        break;
      default:
        // Acknowledge anything else so Stripe stops retrying it.
        break;
    }
  } catch (error) {
    // 500 asks Stripe to retry; the unique index keeps that safe.
    console.error(`[stripe-webhook] handler failed for ${event.type}`, error);
    return new Response("Handler error", { status: 500 });
  }

  return Response.json({ received: true });
}

function statusFor(session: Stripe.Checkout.Session, eventType: string): PaymentStatus {
  if (eventType === "checkout.session.async_payment_failed") return "failed";
  // `unpaid` on a completed session means a delayed-notification method is
  // still clearing -- a seat is not confirmed until it is actually paid.
  if (session.payment_status === "unpaid") return "pending";
  return "paid";
}

async function recordSession(session: Stripe.Checkout.Session, eventType: string) {
  const metadata = session.metadata ?? {};
  const email = session.customer_details?.email ?? session.customer_email;

  if (!email) {
    console.error(`[stripe-webhook] session ${session.id} has no email; skipping`);
    return;
  }

  const status = statusFor(session, eventType);

  const row: InsertRow = {
    tenant_id: metadata.tenantId || INTENSIVE.tenantId,
    first_name: metadata.firstName || session.customer_details?.name?.split(" ")[0] || "Unknown",
    last_name: metadata.lastName || session.customer_details?.name?.split(" ").slice(1).join(" ") || "",
    email,
    // amount_total is authoritative -- it reflects what was actually charged
    // after any discount, not what the price list said.
    amount_cents: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    status,
    checkout_session_id: session.id,
    payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
  };

  // Service-role client: RLS has no insert policy by design, so this is the
  // only path that can create a seat.
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("intensive_registrations")
    .upsert(row, { onConflict: "checkout_session_id" })
    .select("id, status")
    .maybeSingle();

  if (error) throw new Error(`registration upsert failed: ${error.message}`);

  console.log(`[stripe-webhook] ${eventType} -> ${session.id} recorded as ${status}`);

  // Only a genuinely paid seat gets a confirmation email, and only on the
  // transition into paid -- a redelivered event must not re-send it.
  if (status === "paid" && data) {
    await sendConfirmation(row).catch((error) => {
      // A failed email must not fail the webhook: the seat is already paid
      // and recorded, and Stripe retrying would not fix an email outage.
      console.error(`[stripe-webhook] confirmation email failed for ${session.id}`, error);
    });
  }
}

async function sendConfirmation(row: InsertRow) {
  const where = INTENSIVE.zoom.link
    ? `<p><strong>Zoom:</strong> <a href="${INTENSIVE.zoom.link}">${INTENSIVE.zoom.link}</a></p>`
    : `<p><strong>Zoom:</strong> your link is on its way — it is issued closer to the date.</p>`;

  await sendEmail({
    to: row.email,
    subject: `You're in — ${INTENSIVE.name}, ${INTENSIVE.dateLabel}`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;color:#0F172A;">
        <h1 style="font-size:22px;margin:0 0 12px;">${row.first_name}, you're in.</h1>
        <p style="line-height:1.6;color:#334155;margin:0 0 16px;">
          Your seat at <strong>${INTENSIVE.name}</strong> is confirmed.
        </p>
        <p><strong>Date:</strong> ${INTENSIVE.dateLabel}</p>
        <p><strong>Time:</strong> 12:00 PM – 5:00 PM Eastern (${INTENSIVE.timezoneLabel}) · room opens ${INTENSIVE.doorsOpen}</p>
        ${where}
        <p><strong>Paid:</strong> $${(row.amount_cents / 100).toFixed(2)} ${String(row.currency).toUpperCase()} · one payment</p>
        <p style="line-height:1.6;color:#334155;">
          Bring your state, any numbers you already have, and a quiet five hours.
          Worksheets go out the morning of the session.
        </p>
        <p style="color:#64748B;font-size:13px;line-height:1.6;">
          Questions? Reply to this email or call ${INTENSIVE.phone}.
        </p>
      </div>
    `,
  });
}
