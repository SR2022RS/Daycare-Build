"use server";

import { headers } from "next/headers";

import { FUNNEL_HOSTS, INTENSIVE } from "@/lib/intensive/config";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { INTENSIVE_PRODUCT_MARKER } from "@/lib/stripe/routing";
import { RegistrationSchema, type CheckoutResult } from "@/lib/intensive/definitions";

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
export async function startRegistration(formData: FormData): Promise<CheckoutResult> {
  const parsed = RegistrationSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { status: "invalid", errors: fieldErrors(parsed.error) };
  }

  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!stripe || !isStripeConfigured() || !priceId) {
    return {
      status: "unavailable",
      message: `Card payments aren't switched on for this session yet, so nothing was charged and your details weren't saved. Email ${INTENSIVE.contactEmail} or call ${INTENSIVE.phone} and Shikara will hold your seat directly.`,
    };
  }

  const { firstName, lastName, email } = parsed.data;
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
        message: "Stripe did not return a checkout URL. Nothing was charged — please try again.",
      };
    }

    return { status: "redirect", url: session.url };
  } catch (error) {
    // Never surface a raw Stripe error to a buyer: it can leak account and
    // integration detail, and it reads as a failure they caused.
    console.error("[intensive] checkout session creation failed", error);
    return {
      status: "error",
      message: `We couldn't open the payment page. No charge was made — try again, or email ${INTENSIVE.contactEmail}.`,
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
  const rawHost = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const host = rawHost.split(":")[0];

  if (FUNNEL_HOSTS.includes(host)) {
    const protocol = headerList.get("x-forwarded-proto") ?? "https";
    return `${protocol}://${rawHost}`;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const protocol = headerList.get("x-forwarded-proto") ?? (host === "localhost" ? "http" : "https");
  return `${protocol}://${rawHost}`;
}

/** zod v4 keeps field errors under `issues`; this shapes them for the form. */
function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: { firstName?: string[]; lastName?: string[]; email?: string[] } = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === "firstName" || key === "lastName" || key === "email") {
      (out[key] ??= []).push(issue.message);
    }
  }
  return out;
}
