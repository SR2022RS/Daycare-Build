// Lists portal accounts and whether each has ever signed in.
//
//   set -a && . ./.env && set +a && node scripts/db/list-admins.mjs
//
// Reads auth.users only for email/confirmation/last-sign-in metadata. Password
// hashes are never selected -- they cannot be reversed anyway, and a reset
// link is the correct way to get someone in.

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

const { rows } = await client.query(`
  select
    p.full_name,
    p.role,
    p.email,
    t.name as tenant,
    u.email_confirmed_at is not null as confirmed,
    u.last_sign_in_at
  from public.profiles p
  left join public.tenants t on t.id = p.tenant_id
  left join auth.users u on u.id = p.id
  order by
    case p.role when 'platform_admin' then 0 when 'director' then 1 else 2 end,
    p.full_name
`);

console.log(`${rows.length} account(s)\n`);
for (const r of rows) {
  const signedIn = r.last_sign_in_at
    ? new Date(r.last_sign_in_at).toISOString().slice(0, 10)
    : "NEVER SIGNED IN";
  console.log(
    `${(r.role ?? "?").padEnd(15)} ${(r.email ?? "no email").padEnd(38)} ${(r.full_name ?? "").padEnd(22)} ${r.confirmed ? "confirmed" : "UNCONFIRMED"}  ${signedIn}`,
  );
}

const { rows: counts } = await client.query(
  `select role, count(*)::int as n from public.profiles group by role order by role`,
);
console.log("\nby role:", counts.map((c) => `${c.role}=${c.n}`).join("  "));

await client.end();
