import { runIntensiveHealthCheck } from "@/lib/intensive/health";

/**
 * Buy-path health endpoint.
 *
 * Returns 200 when a customer could complete a purchase right now, and 503
 * when they could not -- so an uptime monitor pointed here reports the thing
 * that actually matters, rather than "the marketing page renders".
 *
 * Guarded by CRON_SECRET: the detail strings name which dependency is
 * misconfigured, which is useful to us and useful to an attacker.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const report = await runIntensiveHealthCheck();
  return Response.json(report, { status: report.healthy ? 200 : 503 });
}
