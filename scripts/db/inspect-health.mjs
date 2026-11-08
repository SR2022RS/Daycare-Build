// Read-only: database uptime, timeouts and load signals, for diagnosing
// intermittent API gateway timeouts.
//
//   set -a && . ./.env && set +a && node scripts/db/inspect-health.mjs
import pg from "pg";

const REF = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const client = new pg.Client({
  host: `db.${REF}.supabase.co`, port: 5432, user: "postgres",
  password: process.env.SUPABASE_DATABASE_PASSWORD, database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const q = async (label, sql) => {
  try { const { rows } = await client.query(sql); console.log(`=== ${label} ===`); rows.forEach((r) => console.log("  " + JSON.stringify(r))); }
  catch (e) { console.log(`=== ${label}: ${e.message}`); }
};
await q("server started (UTC)", `select to_char(pg_postmaster_start_time() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as started, version()`);
await q("role timeouts", `select rolname, rolconfig from pg_roles where rolname in ('authenticator','anon','authenticated','service_role','postgres')`);
await q("connections by app", `select coalesce(application_name,'') as app, state, count(*) from pg_stat_activity group by 1,2 order by 3 desc limit 12`);
await q("db stats", `select numbackends, xact_commit, xact_rollback, deadlocks, temp_files, conflicts,
  to_char(stats_reset at time zone 'UTC','YYYY-MM-DD HH24:MI') as stats_reset from pg_stat_database where datname = current_database()`);
await q("registrations table", `select count(*) as rows, pg_size_pretty(pg_total_relation_size('public.intensive_registrations')) as size from public.intensive_registrations`);
await q("scheduled/background jobs", `select pid, backend_type, state, to_char(backend_start at time zone 'UTC','MM-DD HH24:MI') as since, left(query,60) as q
  from pg_stat_activity where backend_type not in ('client backend') order by backend_start limit 15`);
await client.end();
