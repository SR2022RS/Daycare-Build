import { describe, expect, it, vi } from "vitest";

import { retryUntil } from "./retry";

// The shape supabase-js returns: an error object on failure, null on success.
type Result = { error: { message: string } | null };
const failed: Result = { error: { message: "Gateway Timeout" } };
const ok: Result = { error: null };

/** Returns the given results in order, one per call. */
function sequence<T>(...results: T[]) {
  return vi.fn(async () => results.shift() as T);
}

describe("retryUntil", () => {
  it("returns a first-time success without retrying", async () => {
    const run = sequence(ok);
    const out = await retryUntil(run, (r) => Boolean(r.error), [0, 0]);
    expect(out).toEqual({ result: ok, attempts: 1 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("recovers from a single blip -- the Sep 12 and Sep 14 case", async () => {
    const run = sequence(failed, ok);
    const out = await retryUntil(run, (r) => Boolean(r.error), [0, 0]);
    expect(out).toEqual({ result: ok, attempts: 2 });
  });

  it("gives up after every delay is spent and returns the last failure", async () => {
    const run = sequence(failed, failed, failed, ok);
    const out = await retryUntil(run, (r) => Boolean(r.error), [0, 0]);
    expect(out).toEqual({ result: failed, attempts: 3 });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("makes exactly one attempt when given no delays", async () => {
    const run = sequence(failed, ok);
    const out = await retryUntil(run, (r) => Boolean(r.error), []);
    expect(out.attempts).toBe(1);
  });
});
