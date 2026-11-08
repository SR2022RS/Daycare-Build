/**
 * Re-runs `run` while `shouldRetry` says its result is a failure, waiting the
 * given delays between attempts. Returns the last result either way, with how
 * many attempts it took, so callers can report "recovered on attempt 2".
 *
 * Built for the brief upstream hiccups the daily Intensive job hit at 9 AM on
 * Sep 12 and Sep 14: one Supabase request failed while the next one, seconds
 * later in the same run, succeeded. A single failed request must not cost a
 * buyer their reminder or page anybody.
 *
 * `run` should not throw -- supabase-js returns `{ error }` rather than
 * throwing -- so a thrown error propagates to the caller untouched.
 */
export async function retryUntil<T>(
  run: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  delaysMs: readonly number[] = [1500, 4000],
): Promise<{ result: T; attempts: number }> {
  let attempts = 1;
  let result = await run();

  for (const delay of delaysMs) {
    if (!shouldRetry(result)) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempts += 1;
    result = await run();
  }

  return { result, attempts };
}
