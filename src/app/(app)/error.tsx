"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Portal error boundary.
 *
 * Contains a crash to the page that caused it, so one broken screen doesn't
 * take the whole portal down. Staff hitting this are mid-task -- often on the
 * floor with children -- so it says what still works rather than showing a
 * stack trace.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal] unhandled error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[560px] py-16">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h1 className="font-serif text-[17px] font-semibold text-gray-900">
            This page didn&rsquo;t load
          </h1>
          <p className="mt-1 text-[13px] text-gray-500">
            Something went wrong on our side. Nothing you entered was saved.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 px-5 py-4">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to dashboard
          </Link>
        </div>

        {error.digest && (
          <div className="border-t border-gray-100 px-5 py-3 text-[11.5px] text-gray-400">
            Reference <span className="font-mono">{error.digest}</span> &mdash; quote this if you
            report it.
          </div>
        )}
      </div>
    </div>
  );
}
