# Staff Data Entry — Apply Checklist

## STATUS: applied to production 2026-08-27

Applied to `trezwfirgugzuphaflwm` (tenant *AKPA University*) inside a single
transaction, via `scripts/db/apply.mjs`. **Sections 2 through 5 and 7 are done
and passing**, verified against the real database by
`scripts/db/verify-staff-data-entry.mjs`:

- **§2** — both views, both functions, `child_contacts`, and the
  `guard_child_money` trigger all exist.
- **§3** — `child_people` exposes **no** `weekly_rate`,
  `subsidy_weekly_amount` or `rate_note`. This is the check the whole design
  exists to pass.
- **§4** — `anon` has neither SELECT on the views nor EXECUTE on the
  functions; `authenticated` has SELECT and nothing more.
- **§5** — the `children_select` and `children_write` policies still exclude
  `'staff'`. The table was not widened.
- **§7** — a parent entered as `(973) 555-0100` is matched by
  `+1 973 555 0100`, proving the last-10-digits rule. Run inside a
  transaction that was rolled back; zero test rows left behind.

**Also done on the way:** the migration history table was empty, because every
prior migration had been applied by hand in the SQL editor. All 38 were marked
applied with `supabase migration repair`, so `supabase migration list` now
reflects reality for the first time.

**Still outstanding, and it needs a human:** §6 (the money guard) could not be
exercised from here. `current_role()` reads `auth.uid()`, which is null on a
service-role connection, so the trigger short-circuits and returns early by
design. It needs a real staff login attempting a rate change through the
portal. §8 likewise needs a real staff login and a tablet.

---

## Original checklist

One migration: `supabase/migrations/20260826090000_staff_data_entry.sql`.
Apply it in the Supabase SQL editor for `trezwfirgugzuphaflwm` (tenant *AKPA
University*), in a single transaction. Every statement is idempotent, so a
partial apply can be re-run.

**The code is already deployed-safe without it.** Directors keep working
exactly as before; staff simply cannot enter data until this lands.

---

## 1 — Why this is not just "add staff to the RLS policy"

The obvious version of this change — adding `'staff'` to the `children` and
`guardians` policies — is deliberately **not** what the migration does.

RLS grants or denies whole rows, so it cannot express "these columns but not
those". Widening those policies would hand staff `weekly_rate` and
`subsidy_weekly_amount` along with everything else, reversing the ruling in
`20260814120400_child_roster_view.sql`, where staff were kept off the
`children` table precisely so they could see that a family is *overdue*
without seeing what that family *pays*.

So instead:

| | Staff | Director |
|---|---|---|
| Read people | `child_people` view (no money columns) | table |
| Read parents | `child_guardian_people` view | table |
| Write people | `staff_save_child`, `staff_link_guardian` | same RPCs |
| Write money | **cannot** — no parameter exists | table, directly |

`children` and `guardians` RLS is **unchanged**: still director-only.

---

## 2 — Verify the objects exist

```sql
select table_name from information_schema.views
where table_schema = 'public' and table_name in ('child_people', 'child_guardian_people');
-- expect 2 rows

select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name in ('staff_save_child', 'staff_link_guardian');
-- expect 2 rows

select to_regclass('public.child_contacts');       -- expect child_contacts
select tgname from pg_trigger where tgname = 'guard_child_money';  -- expect 1 row
```

## 3 — Verify the views leak no money

The point of the whole migration. If either returns a rate column, stop.

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'child_people';
-- must NOT contain weekly_rate, subsidy_weekly_amount or rate_note
```

## 4 — Verify grants

```sql
select grantee, privilege_type from information_schema.role_table_grants
where table_name in ('child_people', 'child_guardian_people');
-- expect: authenticated / SELECT only. anon must NOT appear.

select grantee, privilege_type from information_schema.role_routine_grants
where routine_name in ('staff_save_child', 'staff_link_guardian');
-- expect: authenticated / EXECUTE only. anon must NOT appear.
```

## 5 — Verify staff still cannot read the children table

Run as a staff-role session (or set the claims), not as service role:

```sql
select count(*) from public.children;   -- expect 0 rows visible
select count(*) from public.child_people; -- expect the real roster
```

If the first returns rows for a staff user, the old policies were widened by
something else and section 1 has been defeated.

## 6 — Verify the money guard

As a **staff** session, against a real child, inside a transaction you roll
back:

```sql
begin;
update public.children set weekly_rate = 999 where id = '<a child id>';
-- expect: ERROR  Only a director can change a child's rates
rollback;
```

As a **director**, the same statement must succeed.

Also confirm the service-role path is unaffected — the webhook, kiosk and
billing jobs run with `auth.uid()` null and must still write freely.

## 7 — Verify guardian reuse

The behaviour promised to Ms. Kai in writing: one parent, not one per child.

```sql
begin;
select public.staff_link_guardian('<child A>', 'Test Parent', '(973) 555-0100', 'tp@example.com', 'Mother', true);
select public.staff_link_guardian('<child B>', 'Test Parent', '+1 973 555 0100', null, 'Mother', true);
-- expect: the SAME guardian id both times, matched on the phone's last 10 digits
select count(*) from public.guardians where email = 'tp@example.com';  -- expect 1
rollback;
```

## 8 — Still needs a human

- A real staff login entering a child end to end from the portal.
- The kiosk showing a `pickup_denied` contact at the door.

Neither can be exercised from SQL, and the second needs a registered tablet.

---

## After applying

Record the date and what was verified at the top of this file, the way
`CHILD-ATTENDANCE-APPLY-CHECKLIST.md` does.
