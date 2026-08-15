import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";
import type { PaymentStatus, Registration } from "@/lib/intensive/definitions";

type Row = Database["public"]["Tables"]["intensive_registrations"]["Row"];

function toRegistration(row: Row): Registration {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status as PaymentStatus,
    checkoutSessionId: row.checkout_session_id,
    createdAt: row.created_at,
  };
}

/**
 * Admin list for /intensive/registrations. Takes the RLS-scoped client, so
 * the policy (director/platform_admin, own tenant) is what actually decides
 * visibility -- the tenant filter here is belt-and-braces, not the guard.
 */
export async function listRegistrations(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<Registration[]> {
  const { data } = await supabase
    .from("intensive_registrations")
    .select(
      "id, tenant_id, first_name, last_name, email, amount_cents, currency, status, checkout_session_id, payment_intent_id, created_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return (data ?? []).map(toRegistration);
}

/**
 * Confirmation-page lookup. /intensive/confirmed is public, so this reads
 * with the service-role client -- authorized purely by the unguessable
 * checkout session id in the URL, the same shape as /forms/fill's token.
 *
 * This is the server-side verification the confirmation page needs: the row
 * only exists because the payment webhook wrote it, so a visitor who invents
 * a session_id gets nothing back. It never trusts the query string alone.
 */
export async function getRegistrationBySession(sessionId: string): Promise<Registration | null> {
  // Stripe session ids are cs_test_/cs_live_ + base62. Reject anything that
  // is not shaped like one before it reaches the database.
  if (!/^cs_[A-Za-z0-9_]{10,255}$/.test(sessionId)) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("intensive_registrations")
    .select(
      "id, tenant_id, first_name, last_name, email, amount_cents, currency, status, checkout_session_id, payment_intent_id, created_at, updated_at",
    )
    .eq("checkout_session_id", sessionId)
    .maybeSingle();

  if (!data) return null;
  return toRegistration(data);
}

export interface RegistrationStats {
  paidCount: number;
  refundedCount: number;
  revenueCents: number;
}

export function summarize(rows: Registration[]): RegistrationStats {
  const paid = rows.filter((r) => r.status === "paid");
  return {
    paidCount: paid.length,
    refundedCount: rows.filter((r) => r.status === "refunded").length,
    revenueCents: paid.reduce((sum, r) => sum + r.amountCents, 0),
  };
}
