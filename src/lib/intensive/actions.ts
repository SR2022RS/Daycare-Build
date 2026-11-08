"use server";

import { headers } from "next/headers";

import { getClientIp } from "@/lib/forms/access-log";
import { FUNNEL_HOSTS, INTENSIVE, isWaitlist } from "@/lib/intensive/config";
import { isCheckoutRateLimited } from "@/lib/intensive/rate-limit";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import {
  CHECKOUT_FAILED_TAG,
  PAYMENT_STARTED_TAG,
  isGhlConfigured,
  upsertIntensiveContact,
} from "@/lib/ghl/client";
import {
  hostedCheckoutUrl,
  withBuyerPrefill,
} from "@/lib/intensive/hosted-checkout";
import { INTENSIVE_PRODUCT_MARKER } from "@/lib/stripe/routing";
import {
  RegistrationSchema,
  WaitlistSchema,
  type CheckoutResult,
  type WaitlistResult,
} from "@/lib/intensive/definitions";
import { WAITLIST_TAG } from "@/lib/ghl/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { waitlistHtml, waitlistSubject } from "@/lib/intensive/waitlist-email";

/**
 * Public, unauthenticated entry point for the /intensive funnel.
 *
 * Creates a Stripe Checkout Session and hands back its hosted URL. Nothing is
 * written to the database here: a paid seat may only be created by the
 * webhook (see app/api/stripe/webhook/route.ts), because a browser can skip,
 * replay or forge the success redirect. The success page verifies against the
 * row the webhook wrote, never against the query string.
 *
 * When Stripe is not configured this returns an honest `unavailable` state
 * rather than a dead button -- /intensive is a public page that has to keep
 * working before payments are switched on.
 */
export async function startRegistration(
  formData: FormData,
): Promise<CheckoutResult> {
  // Between sessions nothing is for sale. /intensive/checkout already
  // redirects to the waitlist, but this server action is a public endpoint of
  // its own: refuse here too, so a cached page or a replayed request cannot
  // open a payment page for a session that has already run.
  if (isWaitlist) {
    return {
      status: "unavailable",
      message: `Seats for the last session are closed and nothing was charged. Join the waitlist on the main page to hear about the next date, or email ${INTENSIVE.contactEmail}.`,
    };
  }

  const parsed = RegistrationSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { status: "invalid", errors: fieldErrors(parsed.error) };
  }

  // Throttle before touching Stripe. This action is public and unauthenticated,
  // so without it a script can create Checkout Sessions in a loop on the same
  // account tuition billing will use. Checked after validation so malformed
  // spam doesn't consume a legitimate visitor's allowance.
  if (isCheckoutRateLimited(await getClientIp())) {
    return {
      status: "error",
      message: `Too many attempts from this connection. Wait a few minutes and try again, or email ${INTENSIVE.contactEmail} and Shikara will hold your seat directly.`,
    };
  }

  const { firstName, lastName, email } = parsed.data;

  // Hosted payment page takes precedence over the Stripe API path whenever it
  // is configured. It needs no secret key, which is exactly why it exists:
  // the API path can only work if a live key is present, valid and permitted
  // to create Checkout Sessions, and a key that failed any of those three
  // returned 401 to every real buyer.
  const hosted = hostedCheckoutUrl();
  if (hosted) {
    // Capture BEFORE redirecting. On this path we never see the payment
    // ourselves at this stage, so if we don't record them here, someone who
    // abandons at the card form leaves no trace anywhere.
    if (isGhlConfigured()) {
      const captured = await upsertIntensiveContact({
        firstName,
        lastName,
        email,
        tag: PAYMENT_STARTED_TAG,
      });
      if (!captured.ok) {
        // Never block the sale on the CRM. Losing a contact record is
        // recoverable from the processor's own records; losing the sale is not.
        console.error(
          `[intensive] pre-payment capture failed for ${email}: ${captured.error}`,
        );
      }
    }

    return {
      status: "redirect",
      url: withBuyerPrefill(hosted, { firstName, lastName, email }),
    };
  }

  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!stripe || !isStripeConfigured() || !priceId) {
    return {
      status: "unavailable",
      message: `Card payments aren't switched on for this session yet, so nothing was charged and your details weren't saved. Email ${INTENSIVE.contactEmail} or call ${INTENSIVE.phone} and Shikara will hold your seat directly.`,
    };
  }

  const origin = await resolveOrigin();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],

      // No payment_method_types: omitting it enables dynamic payment methods,
      // so Apple Pay, Google Pay and anything else eligible are chosen by
      // Stripe per customer and managed from the Dashboard.
      customer_email: email,

      // The webhook reads these back to build the registration row. Metadata
      // is on the session; payment_intent_data.metadata copies it onto the
      // PaymentIntent so a refund investigated in the Dashboard still shows
      // who it belonged to.
      //
      // `product` is what lets the webhook tell an Intensive purchase apart
      // from tuition on the same Stripe account -- see lib/stripe/routing.ts.
      // Without it the webhook falls back to a line-item price lookup, which
      // still works but costs an extra API call per event.
      metadata: {
        firstName,
        lastName,
        tenantId: INTENSIVE.tenantId,
        product: INTENSIVE_PRODUCT_MARKER,
      },
      payment_intent_data: {
        metadata: {
          firstName,
          lastName,
          tenantId: INTENSIVE.tenantId,
          product: INTENSIVE_PRODUCT_MARKER,
        },
      },

      success_url: `${origin}/intensive/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/intensive/checkout?cancelled=1`,

      // Tags sessions from this flow in the Dashboard so it can be compared
      // against any other checkout the account runs.
      integration_identifier: "akpa-intensive-qhtxbmwz",
    });

    if (!session.url) {
      return {
        status: "error",
        message:
          "Stripe did not return a checkout URL. Nothing was charged — please try again.",
      };
    }

    return { status: "redirect", url: session.url };
  } catch (error) {
    // Never surface a raw Stripe error to a buyer: it can leak account and
    // integration detail, and it reads as a failure they caused.
    console.error("[intensive] checkout session creation failed", error);

    // Capture the lead before giving up. Someone who filled in three fields
    // and pressed pay is the warmest lead this funnel produces, and if
    // checkout is broken they otherwise vanish with no trace. Tagged
    // separately so Shikara can call them back and take payment by hand.
    if (isGhlConfigured()) {
      const rescued = await upsertIntensiveContact({
        firstName,
        lastName,
        email,
        tag: CHECKOUT_FAILED_TAG,
      });
      console.error(
        `[intensive] checkout failed for ${email}; lead capture ${rescued.ok ? "ok" : "FAILED: " + rescued.error}`,
      );
    }

    return {
      status: "error",
      message:
        `We couldn't open the payment page just now — nothing was charged. ` +
        `We've saved your details and Shikara will reach out to get you your seat. ` +
        `To sort it immediately, email ${INTENSIVE.contactEmail} or call ${INTENSIVE.phone}.`,
    };
  }
}

/**
 * Absolute origin for Stripe's return URLs.
 *
 * The funnel answers on several domains, so a buyer has to come back to the
 * one they started on -- being bounced to a different domain immediately
 * after paying looks like the payment went somewhere it shouldn't have.
 *
 * The Host header is attacker-controlled, so it is only honoured when it is
 * a known funnel host; anything else falls back to the configured site URL.
 * Otherwise a forged Host would put an arbitrary domain in success_url.
 */
async function resolveOrigin(): Promise<string> {
  const headerList = await headers();
  const rawHost =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const host = rawHost.split(":")[0];

  if (FUNNEL_HOSTS.includes(host)) {
    const protocol = headerList.get("x-forwarded-proto") ?? "https";
    return `${protocol}://${rawHost}`;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const protocol =
    headerList.get("x-forwarded-proto") ??
    (host === "localhost" ? "http" : "https");
  return `${protocol}://${rawHost}`;
}

/** zod v4 keeps field errors under `issues`; this shapes them for the form. */
function fieldErrors(error: {
  issues: { path: PropertyKey[]; message: string }[];
}) {
  const out: { firstName?: string[]; lastName?: string[]; email?: string[] } =
    {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === "firstName" || key === "lastName" || key === "email") {
      (out[key] ??= []).push(issue.message);
    }
  }
  return out;
}

/**
 * Waitlist signup, used between sessions.
 *
 * Nothing is sold here: the person is told the next date before it is
 * announced, and that is the whole promise. Three sinks, in order of how much
 * each one matters if the others fail:
 *
 *   1. our own table -- the list Shikara owns, readable in the portal;
 *   2. GHL, tagged WAITLIST_TAG -- where she actually markets from;
 *   3. a short confirmation email, so the person knows it worked.
 *
 * Only the first can fail the request. A CRM or mail outage must not tell
 * somebody the form is broken when their name is already saved.
 */
export async function joinWaitlist(
  formData: FormData,
): Promise<WaitlistResult> {
  const parsed = WaitlistSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { status: "invalid", errors: fieldErrors(parsed.error) };
  }

  // Same public, unauthenticated exposure the checkout had, so the same
  // throttle: without it this is an open write endpoint.
  if (isCheckoutRateLimited(await getClientIp())) {
    return {
      status: "error",
      message: `Too many attempts from this connection. Wait a few minutes and try again, or email ${INTENSIVE.contactEmail} and Shikara will add you herself.`,
    };
  }

  const { firstName, lastName, email } = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from("intensive_waitlist").insert({
    tenant_id: INTENSIVE.tenantId,
    first_name: firstName,
    last_name: lastName,
    email,
  });

  // 23505 is the unique index on (tenant_id, lower(email)) -- they are already
  // on the list. Telling them so is friendlier than an error, and it must not
  // trigger a second confirmation email.
  const alreadyOn = error?.code === "23505";

  if (error && !alreadyOn) {
    console.error("[intensive] waitlist insert failed", error);
    return {
      status: "error",
      message: `We couldn't save your details just now. Email ${INTENSIVE.contactEmail} and Shikara will add you to the list herself.`,
    };
  }

  if (isGhlConfigured()) {
    const synced = await upsertIntensiveContact({
      firstName,
      lastName,
      email,
      tag: WAITLIST_TAG,
    });
    if (!synced.ok) {
      console.error(
        `[intensive] waitlist CRM sync failed for ${email}: ${synced.error}`,
      );
    }
  }

  if (!alreadyOn) {
    await sendEmail({
      to: email,
      from: INTENSIVE.fromEmail,
      replyTo: INTENSIVE.contactEmail,
      subject: waitlistSubject,
      html: waitlistHtml(firstName),
    }).catch((sendError) => {
      console.error(
        `[intensive] waitlist email failed for ${email}`,
        sendError,
      );
    });
  }

  return {
    status: "joined",
    message: alreadyOn
      ? "You're already on the list — you'll hear from Shikara as soon as the next date is set."
      : "You're on the list. Shikara will email you the date before it goes public.",
  };
}
