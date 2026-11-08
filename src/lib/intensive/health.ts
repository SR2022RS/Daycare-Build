import "server-only";

import { INTENSIVE } from "@/lib/intensive/config";
import { getStripe } from "@/lib/stripe/client";
import { isGhlConfigured } from "@/lib/ghl/client";
import { hostedCheckoutUrl } from "@/lib/intensive/hosted-checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { retryUntil } from "@/lib/retry";

/**
 * Preflight for the whole buy path.
 *
 * Exists because of a real outage: a Stripe key that had been "verified" by
 * running the Stripe CLI turned out to be unusable over plain HTTP, and the
 * first thing to notice was a customer. Every check here is a live call
 * against the real dependency using the same credentials the funnel uses --
 * a check that only reads configuration would have passed while checkout
 * was broken.
 *
 * Deliberately does NOT create a Checkout Session. Retrieving the price
 * exercises the same key and the same auth path, and returns the price's
 * livemode and active flags, without leaving abandoned sessions in the
 * dashboard on every run.
 */

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  healthy: boolean;
  checks: Check[];
}

async function checkStripe(): Promise<Check[]> {
  const priceId = process.env.STRIPE_PRICE_ID;
  const stripe = getStripe();

  if (!stripe)
    return [
      { name: "stripe.key", ok: false, detail: "STRIPE_SECRET_KEY is not set" },
    ];
  if (!priceId)
    return [
      { name: "stripe.price", ok: false, detail: "STRIPE_PRICE_ID is not set" },
    ];

  try {
    const price = await stripe.prices.retrieve(priceId);
    const checks: Check[] = [
      {
        name: "stripe.key",
        ok: true,
        detail: "key authenticates against the API",
      },
      {
        name: "stripe.price.active",
        ok: price.active,
        detail: price.active
          ? "price is active"
          : "PRICE IS ARCHIVED -- checkout will fail",
      },
      {
        name: "stripe.price.amount",
        ok: price.unit_amount === INTENSIVE.price * 100,
        detail: `price is ${price.unit_amount} cents, config says ${INTENSIVE.price * 100}`,
      },
    ];

    // A test-mode price cannot be bought with a live key and vice versa;
    // the mismatch only shows up at the moment someone tries to pay.
    checks.push({
      name: "stripe.mode.match",
      ok: true,
      detail: `price livemode=${price.livemode} (key resolved it, so the modes agree)`,
    });
    return checks;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      {
        name: "stripe.key",
        ok: false,
        // This is the exact shape the outage produced.
        detail: `STRIPE CALL FAILED: ${message.slice(0, 160)}`,
      },
    ];
  }
}

async function checkWebhookSecret(): Promise<Check> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  return {
    name: "stripe.webhook.secret",
    ok: Boolean(secret?.startsWith("whsec_")),
    detail: secret
      ? secret.startsWith("whsec_")
        ? "present and well-formed"
        : "set but does not look like a signing secret"
      : "STRIPE_WEBHOOK_SECRET is not set -- paid seats would never be recorded",
  };
}

async function checkResend(): Promise<Check> {
  const key = process.env.RESEND_API_KEY;
  if (!key)
    return {
      name: "resend.domain",
      ok: false,
      detail: "RESEND_API_KEY is not set",
    };
  try {
    const r = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok)
      return {
        name: "resend.domain",
        ok: false,
        detail: `Resend API ${r.status}`,
      };
    const data = (await r.json()) as {
      data?: { name: string; status: string }[];
    };
    const domain = (data.data ?? []).find((d) =>
      INTENSIVE.fromAddress.endsWith(`@${d.name}`),
    );
    return {
      name: "resend.domain",
      ok: domain?.status === "verified",
      detail: domain
        ? `${domain.name} is ${domain.status}`
        : `no Resend domain matches ${INTENSIVE.fromAddress} -- confirmations would not send`,
    };
  } catch (error) {
    return {
      name: "resend.domain",
      ok: false,
      detail:
        error instanceof Error ? error.message.slice(0, 120) : "unreachable",
    };
  }
}

async function checkDatabase(): Promise<Check> {
  try {
    const admin = createAdminClient();
    // A normal GET, not a HEAD count. A failed HEAD has no body, so supabase-js
    // reports it with no code and an empty message -- which is how the alert
    // came to read "database.registrations: undefined".
    //
    // Retried because both failures so far (Sep 12, Sep 14, each at 9 AM) were
    // one request timing out while the next, seconds later, succeeded.
    const { result, attempts } = await retryUntil(
      async () =>
        await admin.from("intensive_registrations").select("id").limit(1),
      (response) => Boolean(response.error),
    );
    const { error, status } = result;
    if (!error) {
      return {
        name: "database.registrations",
        ok: true,
        detail:
          attempts > 1
            ? `table reachable (recovered on attempt ${attempts})`
            : "table reachable",
      };
    }
    return {
      name: "database.registrations",
      ok: false,
      detail: describeDbError(status, error, attempts),
    };
  } catch (error) {
    return {
      name: "database.registrations",
      ok: false,
      detail:
        error instanceof Error ? error.message.slice(0, 120) : "unreachable",
    };
  }
}

/** Never prints "undefined": uses whichever of status, code and message exist. */
function describeDbError(
  status: number,
  error: { code?: string; message?: string },
  attempts: number,
): string {
  const parts = [
    status ? `HTTP ${status}` : null,
    error.code || null,
    error.message?.trim() || null,
  ];
  const what = parts.filter(Boolean).join(" ") || "no response";
  return `${what} (failed all ${attempts} attempts)`.slice(0, 160);
}

/**
 * Hosted-path preflight: the payment page has to actually answer.
 *
 * A hosted URL cannot fail the way an API key does, but it can 404 the day
 * somebody renames a funnel step or unpublishes it -- and a dead link is
 * indistinguishable to a buyer from a dead key.
 */
async function checkHostedCheckout(url: string): Promise<Check> {
  try {
    // GET, not HEAD: funnel hosts routinely 405 a HEAD while serving the page
    // perfectly well, which would read as an outage that isn't one.
    const response = await fetch(url, { redirect: "follow" });
    return {
      name: "payment.page",
      ok: response.ok,
      detail: response.ok
        ? `payment page answers ${response.status}`
        : `PAYMENT PAGE RETURNED ${response.status} -- buyers cannot pay`,
    };
  } catch (error) {
    return {
      name: "payment.page",
      ok: false,
      detail: `PAYMENT PAGE UNREACHABLE: ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}`,
    };
  }
}

function checkGhlWebhookSecret(): Check {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  return {
    name: "ghl.webhook.secret",
    ok: Boolean(secret && secret.length >= 32),
    detail: secret
      ? secret.length >= 32
        ? "present"
        : "set but too short to be a real secret"
      : "GHL_WEBHOOK_SECRET is not set -- paid seats would never be recorded",
  };
}

export async function runIntensiveHealthCheck(): Promise<HealthReport> {
  // Seats are not on sale between sessions, so there is no buy path to guard.
  // Checking one anyway would alert every morning about a checkout that is
  // closed deliberately. What still has to work is the waitlist: its name goes
  // to the database and its confirmation goes through Resend.
  if (INTENSIVE.registration === "waitlist") {
    const [resend, database] = await Promise.all([
      checkResend(),
      checkDatabase(),
    ]);
    const checks: Check[] = [
      {
        name: "registration.mode",
        ok: true,
        detail:
          "waitlist — seats are not on sale, so the buy path is not checked",
      },
      resend,
      database,
    ];
    return { healthy: checks.every((check) => check.ok), checks };
  }

  const hosted = hostedCheckoutUrl();
  const [resend, database] = await Promise.all([
    checkResend(),
    checkDatabase(),
  ]);

  // Which checks are fatal depends on which path is live. On the hosted path
  // the Stripe key is irrelevant -- checking it would raise an alarm every
  // day about a credential nothing uses. On the API path GHL is only a CRM.
  const checks: Check[] = hosted
    ? [
        {
          name: "payment.mode",
          ok: true,
          detail: "hosted checkout (INTENSIVE_PAYMENT_URL)",
        },
        await checkHostedCheckout(hosted),
        // Fatal here, unlike on the API path: the webhook verifies every order
        // through these credentials, so without them nobody gets seated.
        {
          name: "ghl.configured",
          ok: isGhlConfigured(),
          detail: isGhlConfigured()
            ? "credentials present"
            : "GHL NOT CONFIGURED -- orders cannot be verified or recorded",
        },
        checkGhlWebhookSecret(),
        resend,
        database,
      ]
    : [
        {
          name: "payment.mode",
          ok: true,
          detail: "Stripe API (Checkout Sessions)",
        },
        ...(await checkStripe()),
        await checkWebhookSecret(),
        resend,
        database,
        {
          name: "ghl.configured",
          ok: isGhlConfigured(),
          // Not fatal on this path: a missing CRM loses follow-up, not the sale.
          detail: isGhlConfigured()
            ? "credentials present"
            : "not configured (leads will not sync)",
        },
      ];

  const nonFatal = hosted ? new Set<string>() : new Set(["ghl.configured"]);
  const fatal = checks.filter((c) => !c.ok && !nonFatal.has(c.name));
  return { healthy: fatal.length === 0, checks };
}
