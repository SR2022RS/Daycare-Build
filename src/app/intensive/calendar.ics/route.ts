import { buildIcs } from "@/lib/intensive/config";

/**
 * Serves the session as a downloadable calendar file.
 *
 * Deliberately a plain GET rather than a client-side Blob download: an
 * <a download> works with no JavaScript, survives long-press "Download
 * linked file" on iOS, and lets the OS hand the file straight to the
 * calendar app. The contents are derived entirely from the config object,
 * so changing the date updates the .ics with no other edit.
 */
export const dynamic = "force-static";

export async function GET() {
  return new Response(buildIcs(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="daycare-owner-intensive.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
