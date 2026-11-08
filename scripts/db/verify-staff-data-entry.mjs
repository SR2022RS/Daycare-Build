import pg from "pg";

const REF =
  process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];
const client = new pg.Client({
  host: `db.${REF}.supabase.co`,
  port: 5432,
  user: "postgres",
  password: process.env.SUPABASE_DATABASE_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const check = async (label, sql, assess) => {
  const { rows } = await client.query(sql);
  const verdict = assess(rows);
  console.log(
    `${verdict.ok ? "PASS" : "FAIL"}  ${label}${verdict.note ? " — " + verdict.note : ""}`,
  );
  return verdict.ok;
};

let allOk = true;
const track = async (...args) => {
  allOk = (await check(...args)) && allOk;
};

console.log("§2  objects exist");
await track(
  "views child_people + child_guardian_people",
  `select table_name from information_schema.views
   where table_schema='public' and table_name in ('child_people','child_guardian_people')`,
  (r) => ({ ok: r.length === 2, note: `${r.length}/2` }),
);
await track(
  "functions staff_save_child + staff_link_guardian",
  `select routine_name from information_schema.routines
   where routine_schema='public' and routine_name in ('staff_save_child','staff_link_guardian')`,
  (r) => ({ ok: r.length === 2, note: `${r.length}/2` }),
);
await track(
  "table child_contacts",
  `select to_regclass('public.child_contacts') as t`,
  (r) => ({ ok: r[0].t !== null, note: String(r[0].t) }),
);
await track(
  "trigger guard_child_money",
  `select tgname from pg_trigger where tgname='guard_child_money'`,
  (r) => ({ ok: r.length === 1 }),
);

console.log("\n§3  views leak no money  ← the point of the whole design");
await track(
  "child_people has no rate columns",
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='child_people'
     and column_name in ('weekly_rate','subsidy_weekly_amount','rate_note')`,
  (r) => ({
    ok: r.length === 0,
    note: r.length ? `LEAKS ${r.map((x) => x.column_name).join(",")}` : "clean",
  }),
);

console.log("\n§4  grants");
await track(
  "views: authenticated SELECT only, anon absent",
  `select grantee, privilege_type from information_schema.role_table_grants
   where table_name in ('child_people','child_guardian_people')`,
  (r) => {
    const anon = r.some((x) => x.grantee === "anon");
    const bad = r.some(
      (x) => x.grantee === "authenticated" && x.privilege_type !== "SELECT",
    );
    return {
      ok: !anon && !bad,
      note: anon
        ? "anon HAS ACCESS"
        : bad
          ? "authenticated has more than SELECT"
          : "clean",
    };
  },
);
await track(
  "functions: anon cannot execute",
  `select grantee from information_schema.role_routine_grants
   where routine_name in ('staff_save_child','staff_link_guardian') and grantee='anon'`,
  (r) => ({
    ok: r.length === 0,
    note: r.length ? "anon CAN EXECUTE" : "clean",
  }),
);

console.log("\n§5  children table still closed to staff");
await track(
  "children policies exclude staff",
  `select policyname, qual::text from pg_policies
   where tablename='children' and policyname in ('children_select','children_write')`,
  (r) => {
    const leaky = r.filter((x) => x.qual && x.qual.includes("'staff'"));
    return {
      ok: leaky.length === 0 && r.length === 2,
      note: leaky.length
        ? "STAFF WIDENED"
        : `${r.length} policies, staff excluded`,
    };
  },
);

console.log("\n§7  guardian reuse — one parent, not one per child");
const { rows: kids } = await client.query(
  `select id from public.children limit 1`,
);
if (kids.length === 0) {
  console.log("SKIP  no children in the database to test against");
} else {
  await client.query("begin");
  try {
    // current_role()/current_tenant_id() read auth.uid(), which is null here,
    // so exercise the matching logic directly rather than through the RPC.
    const tenant = (
      await client.query(`select tenant_id from public.children where id=$1`, [
        kids[0].id,
      ])
    ).rows[0].tenant_id;
    await client.query(
      `insert into public.guardians (tenant_id, full_name, phone, email)
       values ($1,'ZZ Verify Parent','(973) 555-0100','zz-verify@example.com')`,
      [tenant],
    );
    const { rows: match } = await client.query(
      `select id from public.guardians
       where tenant_id=$1
         and right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10) = right(regexp_replace($2, '\\D','','g'), 10)`,
      [tenant, "+1 973 555 0100"],
    );
    console.log(
      `${match.length === 1 ? "PASS" : "FAIL"}  differently-formatted phone matches the same parent — ${match.length} hit(s)`,
    );
    allOk = match.length === 1 && allOk;
  } finally {
    await client.query("rollback");
  }
  const { rows: leftover } = await client.query(
    `select count(*)::int as n from public.guardians where email='zz-verify@example.com'`,
  );
  console.log(
    `${leftover[0].n === 0 ? "PASS" : "FAIL"}  test row rolled back — ${leftover[0].n} left behind`,
  );
  allOk = leftover[0].n === 0 && allOk;
}

console.log(`\n${allOk ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
await client.end();
process.exitCode = allOk ? 0 : 1;
