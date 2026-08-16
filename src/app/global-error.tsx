"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches failures in the root layout itself, which the
 * per-section error.tsx files sit inside and therefore cannot catch.
 *
 * It replaces the whole document, so it must render its own <html>/<body> and
 * cannot rely on the app's fonts, CSS variables or Tailwind being available.
 * Everything here is inline for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root] unhandled error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#171717",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "420px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 10px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "15px", lineHeight: 1.6, color: "#4b5563", margin: "0 0 20px" }}>
            The page failed to load. Nothing you entered was saved.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              background: "#ffffff",
              padding: "9px 18px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "24px" }}>
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
