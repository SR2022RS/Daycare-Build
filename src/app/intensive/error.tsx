"use client";

import { useEffect } from "react";

import { INTENSIVE } from "@/lib/intensive/config";

/**
 * Funnel error boundary.
 *
 * The funnel currently shares a deployment with the childcare portal, so a
 * crash here must not surface as a portal-wide failure. It also sits in front
 * of a paid checkout: someone hitting this may have been about to spend $300,
 * so it gives them a human to reach rather than a dead end.
 */
export default function IntensiveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[intensive] unhandled error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[560px] flex-col justify-center px-6 py-16">
      <h1 className="font-serif text-2xl font-semibold text-gray-900">
        This page didn&rsquo;t load
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
        Something went wrong on our side, and <strong>you have not been charged</strong>. Try again,
        or reach Shikara directly and she&rsquo;ll hold your seat.
      </p>

      <div className="mt-6 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[var(--brand-accent)] px-5 py-2.5 text-sm font-semibold text-[#06323A] hover:opacity-90"
        >
          Try again
        </button>
        <a
          href={`mailto:${INTENSIVE.contactEmail}`}
          className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Email {INTENSIVE.contactEmail}
        </a>
      </div>

      <p className="mt-4 text-[13px] text-gray-500">
        Or call <a className="underline" href={`tel:${INTENSIVE.phone}`}>{INTENSIVE.phone}</a>.
      </p>

      {error.digest && (
        <p className="mt-8 text-[11.5px] text-gray-400">
          Reference <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
