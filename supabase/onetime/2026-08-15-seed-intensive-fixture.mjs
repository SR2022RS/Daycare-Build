/**
 * Seeds the /intensive test fixture over HTTPS using the service-role key.
 *
 * Companion to 2026-08-15-apply-intensive.mjs, which needs a direct Postgres
 * connection. This one does not: it goes through PostgREST, which is IPv4 and
 * reachable anywhere the app itself is. Use it when the table already exists
 * and you only need rows.
 *
 * Requires the migration to have been applied first -- PostgREST cannot
 * create tables. If the table is missing this exits with a clear message
 * rather than a schema-cache error.
 *
 * Run:
 *   node --env-file=.env supabase/onetime/2026-08-15-seed-intensive-fixture.mjs
 *   node --env-file=.env supabase/onetime/2026-08-15-seed-intensive-fixture.mjs --remove
 *
 * Safe to re-run: upserts on checkout_session_id, so repeats are no-ops.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL env var required");
if (!SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY env var required");

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TENANT = "00000000-0000-0000-0000-000000000001";
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

// Mirrors 2026-08-15-intensive-test-registrations.sql. The mix is deliberate:
// three paid rows drive the headcount and revenue tiles, the refunded row
// proves both are excluded from it, and the pending row proves
// /intensive/confirmed refuses to show "you're in" before a payment clears.
const ROWS = [
  { first_name: "Danielle", last_name: "Okafor", email: "d.okafor@example.test",
    status: "paid", checkout_session_id: "cs_test_fixture_danielle_okafor",
    payment_intent_id: "pi_test_fixture_001", created_at: daysAgo(11) },
  { first_name: "Marcus", last_name: "Bell", email: "marcus.bell@example.test",
    status: "paid", checkout_session_id: "cs_test_fixture_marcus_bell",
    payment_intent_id: "pi_test_fixture_002", created_at: daysAgo(10) },
  { first_name: "Yvette", last_name: "Ramirez", email: "yvette.ramirez@example.test",
    status: "paid", checkout_session_id: "cs_test_fixture_yvette_ramirez",
    payment_intent_id: "pi_test_fixture_003", created_at: daysAgo(8) },
  { first_name: "Robert", last_name: "Nnamdi", email: "r.nnamdi@example.test",
    status: "refunded", checkout_session_id: "cs_test_fixture_robert_nnamdi",
    payment_intent_id: "pi_test_fixture_004", created_at: daysAgo(5) },
  { first_name: "Alicia", last_name: "Freeman", email: "alicia.freeman@example.test",
    status: "pending", checkout_session_id: "cs_test_fixture_alicia_freeman",
    payment_intent_id: null, created_at: daysAgo(2) },
].map((r) => ({ ...r, tenant_id: TENANT, amount_cents: 30000, currency: "usd" }));

if (process.argv.includes("--remove")) {
  const { error, count } = await supabase
    .from("intensive_registrations")
    .delete({ count: "exact" })
    .like("checkout_session_id", "cs_test_fixture_%");

  if (error) {
    console.error("✗ removal failed:", error.message);
    process.exit(1);
  }
  console.log(`✓ removed ${count ?? 0} fixture row(s)`);
  process.exit(0);
}

const { error } = await supabase
  .from("intensive_registrations")
  .upsert(ROWS, { onConflict: "checkout_session_id", ignoreDuplicates: true });

if (error) {
  const missing = /relation .* does not exist|schema cache|PGRST205/i.test(
    `${error.message} ${error.code ?? ""}`,
  );
  console.error(
    missing
      ? "✗ table intensive_registrations does not exist yet — apply\n" +
          "  supabase/migrations/20260815090000_intensive_registrations.sql first\n" +
          "  (SQL Editor, or 2026-08-15-apply-intensive.mjs with a pooler DATABASE_URL)"
      : `✗ seed failed: ${error.message}`,
  );
  process.exit(1);
}

const { data, error: readError } = await supabase
  .from("intensive_registrations")
  .select("status")
  .like("checkout_session_id", "cs_test_fixture_%");

if (readError) {
  console.error("✗ verification read failed:", readError.message);
  process.exit(1);
}

const tally = data.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log("✓ fixture seeded —", Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(" "));
console.log("  try /intensive/confirmed?session_id=cs_test_fixture_danielle_okafor");
