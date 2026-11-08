// Read-only: lists pg_cron jobs and their recent runs, to see what the
// database is doing at a given time of day.
//
//   set -a && . ./.env && set +a && node scripts/db/inspect-cron.mjs
import pg from "pg";

const REF = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const client = new pg.Client({
  host: `db.${REF}.supabase.co`,
  port: 5432,
  user: "postgres",
  password: process.env.SUPABASE_DATABASE_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const q = async (label, sql) => {
  try {
    const { rows } = await client.query(sql);
    console.log(`=== ${label} (${rows.length}) ===`);
    for (const r of rows) console.log("  " + JSON.stringify(r));
  } catch (e) {
    console.log(`=== ${label}: ${e.message}`);
  }
};

await q("pg_cron jobs", `select jobid, jobname, schedule, active, left(command, 110) as command
                         from cron.job order by jobid`);
await q("runs in the last 4 days", `
  select j.jobname, d.status, to_char(d.start_time at time zone 'UTC', 'MM-DD HH24:MI:SS') as start_utc,
         round(extract(epoch from (d.end_time - d.start_time))::numeric, 1) as secs,
         left(d.return_message, 100) as message
  from cron.job_run_details d join cron.job j using (jobid)
  where d.start_time > now() - interval '4 days'
  order by d.start_time desc limit 30`);
await q("slowest runs ever", `
  select j.jobname, round(max(extract(epoch from (d.end_time - d.start_time)))::numeric, 1) as max_secs,
         round(avg(extract(epoch from (d.end_time - d.start_time)))::numeric, 1) as avg_secs, count(*) as runs
  from cron.job_run_details d join cron.job j using (jobid) group by j.jobname`);
await client.end();
