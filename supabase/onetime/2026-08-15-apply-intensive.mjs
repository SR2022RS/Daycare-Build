/**
 * Applies the intensive_registrations migration (and optionally the test
 * fixture) straight to Postgres.
 *
 * Why this exists: the Supabase CLI is logged into an account that has no
 * access to this project, so `supabase db push` is unavailable. DDL also
 * cannot go through PostgREST/supabase-js -- the service-role key gets you
 * DML on existing tables, not CREATE TABLE. A direct Postgres connection is
 * the remaining path, and `pg` is already a devDependency.
 *
 * Run:
 *   node --env-file=.env supabase/onetime/2026-08-15-apply-intensive.mjs
 *   node --env-file=.env supabase/onetime/2026-08-15-apply-intensive.mjs --with-fixture
 *
 * If the default host is unreachable (new projects are IPv6-only on the
 * direct host), copy the pooler URI from the dashboard --
 * Project Settings -> Database -> Connection string -> Session mode -- and
 * pass it as DATABASE_URL instead.
 *
 * Safe to re-run: the migration is skipped if the table already exists, and
 * the fixture upserts on checkout_session_id rather than duplicating rows.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, "..", "migrations", "20260815090000_intensive_registrations.sql");
const FIXTURE = join(here, "2026-08-15-intensive-test-registrations.sql");

const withFixture = process.argv.includes("--with-fixture");

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DATABASE_PASSWORD;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!password) throw new Error("SUPABASE_DATABASE_PASSWORD is not set (or pass DATABASE_URL)");

  const ref = new URL(url).hostname.split(".")[0];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

const client = new pg.Client({
  connectionString: connectionString(),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const { rows } = await client.query(`select to_regclass('public.intensive_registrations') as t`);
  const exists = rows[0].t !== null;

  if (exists) {
    console.log("• intensive_registrations already exists — skipping migration");
  } else {
    // One transaction: the enum, table, indexes, trigger and RLS policy all
    // land together or not at all. A half-applied migration that created the
    // table but not the RLS policy would leave the data readable by anyone.
    await client.query("begin");
    await client.query(readFileSync(MIGRATION, "utf8"));
    await client.query("commit");
    console.log("✓ migration applied");
  }

  if (withFixture) {
    // The fixture carries its own ON CONFLICT clause, so a repeat run is a
    // no-op rather than a duplicate-key error.
    await client.query(readFileSync(FIXTURE, "utf8"));
    const { rows: counted } = await client.query(
      `select status, count(*)::int as n from public.intensive_registrations
        where checkout_session_id like 'cs_test_fixture_%' group by status order by status`,
    );
    console.log("✓ fixture rows:", counted.map((r) => `${r.status}=${r.n}`).join(" "));
  }

  const { rows: total } = await client.query(
    `select count(*)::int as n from public.intensive_registrations`,
  );
  console.log(`• intensive_registrations now holds ${total[0].n} row(s)`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("✗ failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
