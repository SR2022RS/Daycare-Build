// Applies one migration file to the remote database, inside a transaction.
//
//   set -a && . ./.env && set +a && node scripts/db/apply.mjs supabase/migrations/<file>.sql
//
// Exists because this project's migrations were applied by hand in the SQL
// editor for months, so supabase_migrations.schema_migrations was empty and
// `supabase db push` would have tried to replay all 39 of them against a
// database that already had them. The history has since been repaired, but
// four files share the timestamp 20260802141908 and two share 20260802164159,
// and the history table is keyed by version -- so push still sees the extras
// as pending. Until those filenames are made unique, apply one file at a time
// through here rather than pushing.
//
// Connects to db.<ref>.supabase.co directly (IPv6). The pooler needs the
// region in its hostname; this does not.

import { readFileSync } from "node:fs";
import pg from "pg";

const REF =
  process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const file = process.argv[2];
const version = file.match(/(\d{14})_/)[1];

const client = new pg.Client({
  host: `db.${REF}.supabase.co`,
  port: 5432,
  user: "postgres",
  password: process.env.SUPABASE_DATABASE_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const sql = readFileSync(file, "utf8");

await client.connect();
console.log(`connected to ${REF}`);

try {
  await client.query("begin");
  await client.query(sql);

  // Keep the history table honest so future `supabase migration list` output
  // reflects reality. ON CONFLICT because the version may already be there.
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)
     on conflict (version) do nothing`,
    [
      version,
      file
        .split("/")
        .pop()
        .replace(/^\d+_/, "")
        .replace(/\.sql$/, ""),
    ],
  );

  await client.query("commit");
  console.log(`APPLIED ${version}`);
} catch (error) {
  await client.query("rollback");
  console.error(`FAILED, rolled back: ${error.message}`);
  if (error.position) console.error(`  at character ${error.position}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
