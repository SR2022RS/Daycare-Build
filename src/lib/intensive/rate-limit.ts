import "server-only";

/**
 * Best-effort throttle for the public, unauthenticated checkout action.
 *
 * `startRegistration` calls Stripe on every submission with no auth in front
 * of it, so a script can create Checkout Sessions in a loop -- burning API
 * quota on the account tuition billing will share, and consuming the same
 * compute that serves the childcare portal.
 *
 * DELIBERATELY IN-MEMORY, and honest about what that means: the counter lives
 * in one server instance, so a distributed flood or a cold start slips
 * through. On Vercel Fluid Compute instances are reused across requests, so
 * this reliably stops the common case -- one address hammering the form --
 * which is the realistic abuse here.
 *
 * Chosen over a database counter because the durable version needs a new
 * table and migration, and every migration on this project has to be applied
 * by hand against production. If abuse ever justifies it, swap the Map for a
 * table keyed the same way; nothing else changes.
 */

const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 8;

/** ip -> timestamps of attempts inside the current window. */
const attempts = new Map<string, number[]>();

/**
 * Records an attempt and reports whether this caller has exceeded the window.
 * Call once per submission, before touching Stripe.
 */
export function isCheckoutRateLimited(ip: string): boolean {
  // An unidentifiable caller shouldn't share a bucket with everyone else --
  // that would let one abuser lock out every unknown-IP visitor.
  if (!ip || ip === "unknown") return false;

  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);

  // Opportunistic sweep so the Map can't grow without bound on a long-lived
  // instance. Cheap: only runs when a bucket is already being touched.
  if (attempts.size > 5_000) {
    for (const [key, times] of attempts) {
      if (times.every((at) => now - at >= WINDOW_MS)) attempts.delete(key);
    }
  }

  return recent.length > MAX_ATTEMPTS_PER_WINDOW;
}
