import "server-only";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FormAccessOutcome } from "@/types/database.types";

const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_NOT_FOUND = 20;

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

// Tokens are 122-bit CSPRNG (uuid v4), so brute force is already
// computationally infeasible -- this is defense in depth against abuse/DoS,
// not the primary control. Only counts genuine guesses (not_found), not
// legitimately-issued tokens that happen to have expired, so a parent
// revisiting an old link repeatedly never trips it.
export async function isRateLimited(ip: string): Promise<boolean> {
  if (ip === "unknown") return false;

  const admin = createAdminClient();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from("form_send_access_log")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("outcome", "not_found")
    .gte("created_at", since);

  return (count ?? 0) >= RATE_LIMIT_MAX_NOT_FOUND;
}

export async function logAccess(token: string, ip: string, outcome: FormAccessOutcome): Promise<void> {
  const admin = createAdminClient();
  await admin.from("form_send_access_log").insert({ token, ip, outcome });
}
