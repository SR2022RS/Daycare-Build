import "server-only";

/**
 * Throttle for the public tour form. Separate from the checkout limiter so a
 * burst of tour requests cannot lock a parent out of paying, or the reverse.
 *
 * In-memory on purpose: one server instance stops a single address hammering
 * the form. A cold start or a second instance can slip through. That is the
 * same tradeoff as the checkout throttle, and it needs no extra table.
 */

const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

const attempts = new Map<string, number[]>();

export function isTourRateLimited(ip: string): boolean {
  if (!ip || ip === "unknown") return false;

  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);

  if (attempts.size > 5_000) {
    for (const [key, times] of attempts) {
      if (times.every((at) => now - at >= WINDOW_MS)) attempts.delete(key);
    }
  }

  return recent.length > MAX_ATTEMPTS_PER_WINDOW;
}
