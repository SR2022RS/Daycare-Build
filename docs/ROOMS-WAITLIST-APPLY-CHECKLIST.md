# Rooms & Waitlist — Post-Apply Checklist

## HARD PRECONDITION — read before doing anything else

`public.rooms` — the table this entire migration alters — is created by
`supabase/migrations/20260813090000_kiosk_access.sql`. As of this writing
that migration is **not in the repository**: it exists only as an
uncommitted, untracked file in the working tree. An untracked file is not
part of any commit, branch, or checkout — it applies nowhere until someone
commits it.

**`20260815120000_rooms_capacity_and_waitlist.sql` cannot be applied to any
database until `20260813090000_kiosk_access.sql` is committed and applied
first.** Every `alter table public.rooms ...` statement in this migration
will fail outright — `relation "public.rooms" does not exist` — if run
first. This is the single thing most likely to make the apply fail; check
it before running anything below, every time, since "untracked" can silently
change between when this checklist was written and when you run it.

This migration was authored but never applied or run against any database
(per controller ruling: the project isn't linked and the database is live
production), and no page in this feature has ever rendered against real
data. Once the precondition above is satisfied, run every check in this
document yourself, in order, after applying:

- `supabase/migrations/20260815120000_rooms_capacity_and_waitlist.sql`

It is **not re-runnable** — every `alter table ... add column`, `add
constraint`, and `create index` in it is unguarded (no `if not exists`), so
running it a second time will fail outright on the first `add column`. If
it partially applies and errors partway through, do not re-run it as-is;
inspect what landed (`\d public.rooms`, `\d public.children`) and hand-apply
only the remaining statements.

**Governing constraint, stated up front:** `children.classroom` is free
text on live records nobody on this project has inspected. The migration
deliberately does no backfill — it does not read, match, or migrate
`classroom` values in any way. `room_id` starts `null` on every child, old
and new, and stays `null` until a director assigns it through the UI.
Section 2 below is the single most important check in this document: it
exists to prove that held.

## 0. Order of operations

This file must be applied **after every billing migration** —
`20260814120000` through `20260814120800`, per
`docs/BILLING-APPLY-CHECKLIST.md` — because it shares the `children` table
those migrations extend (billing added `child_balance_status`, credit
columns, etc.) and Section 8 below depends on `child_balance_status`
existing. It must also apply after `20260813090000_kiosk_access.sql`
(creates `public.rooms`) and `20260802224828_children_and_guardians.sql`
(creates `public.children`).

Unlike the billing migrations, `20260813090000_kiosk_access.sql` being
applied first is **not automatic** — see the HARD PRECONDITION at the top
of this document. It must be committed before it exists anywhere for
timestamp ordering to apply to it at all. Once it is committed, apply every
pending migration in plain timestamp order and the rest is automatic; do
not hand-pick `20260815120000` out of sequence.

## Rollback plan — if the migration half-applies

`20260815120000_rooms_capacity_and_waitlist.sql` has no transaction wrapper
and every statement in it is unguarded (no `if not exists` / `if exists`),
so if it errors partway through — most likely on the precondition failure
above, but also possible from a constraint or index name collision — some
statements will have committed and others won't. Do not just re-run the
file; inspect what landed first (`\d public.rooms`, `\d public.children`)
against the statement list in the migration, then either hand-apply the
remaining statements or fully reverse what did land using the block below.

This is a **recovery path**, not a routine step — only run it if you've
confirmed a partial apply and have decided to back it out rather than
finish applying it. Every statement uses `if exists`, so it's safe to run
even against a rows-only-partially-applied state; it only removes what this
migration itself would have added, and touches no data (no `drop table`,
no row deletes) beyond the columns/indexes/constraints below:

```sql
-- children: waitlist + room columns (also drops the room_id FK, since the
-- FK is defined inline on the column and dropping the column drops it).
drop index if exists public.children_waitlist_idx;
drop index if exists public.children_room_id_idx;
alter table public.children drop column if exists desired_start_date;
alter table public.children drop column if exists waitlisted_at;
alter table public.children drop column if exists room_id;

-- rooms: capacity + age band columns and their check constraints (dropping
-- the column drops constraints defined on it, but they're listed
-- explicitly here in case a partial apply left a constraint without its
-- column already gone, or vice versa).
alter table public.rooms drop constraint if exists rooms_age_band_ordered;
alter table public.rooms drop constraint if exists rooms_max_age_non_negative;
alter table public.rooms drop constraint if exists rooms_min_age_non_negative;
alter table public.rooms drop constraint if exists rooms_capacity_positive;
alter table public.rooms drop column if exists max_age_months;
alter table public.rooms drop column if exists min_age_months;
alter table public.rooms drop column if exists capacity;
```

After running this, Section 1's queries below should return zero rows for
all six columns and both index names — confirming a clean reversal before
you decide whether to re-apply or leave rooms/waitlist off for now.

## 1. Migration applied cleanly

```sql
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'rooms'
  and column_name in ('capacity', 'min_age_months', 'max_age_months')
order by column_name;

select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'children'
  and column_name in ('room_id', 'waitlisted_at', 'desired_start_date')
order by column_name;

select indexname from pg_indexes
where schemaname = 'public' and tablename = 'children'
  and indexname in ('children_room_id_idx', 'children_waitlist_idx');
```

Expected: all six columns present and `is_nullable = 'YES'` (every one of
them is nullable by design — see the migration's header comment), and both
index names returned.

## 2. Nothing was destroyed (the most important check)

```sql
select
  count(*) as total_children,
  count(*) filter (where classroom is not null) as has_classroom,
  count(*) filter (where classroom is not null and classroom <> '') as has_nonblank_classroom,
  count(*) filter (where room_id is null) as unassigned
from public.children;
```

Expected: **`unassigned = total_children`** — every child row, old and
new, has `room_id is null` immediately after applying. If `unassigned` is
less than `total_children`, something backfilled or matched `room_id`
that this migration should never have touched — stop and investigate
before doing anything else in this document.

`has_classroom` / `has_nonblank_classroom` are not "pass/fail" against a
fixed number — there is no prior snapshot to diff against, since nobody
has queried this table before. They exist so you can sanity-check the
count against what you already know about the roster (e.g. "we have ~29
enrolled families, and this says 29 rows have a `classroom` value" is
reassuring; "0 rows have a classroom value" when you know most kids have
one written down somewhere is not). The real proof of "nothing destroyed"
is the `unassigned = total_children` equality above, and that `classroom`
itself was never written to by this migration (it has no `update`
statement touching `classroom` at all — confirm by re-reading
`20260815120000_rooms_capacity_and_waitlist.sql` yourself; there is
nothing to query for this half, only to read).

## 3. The reconciliation query — what you need before assigning any room

This is the query that tells you what each free-text `classroom` value on
your live roster should map to, before you touch a single child's `room_id`.
Replace `<TENANT_ID>`:

```sql
select
  c.classroom,
  count(*) as children,
  (
    select string_agg(r.name, ', ')
    from public.rooms r
    where r.tenant_id = c.tenant_id and r.is_active
  ) as existing_rooms
from public.children c
where c.tenant_id = '<TENANT_ID>'::uuid
group by c.classroom, c.tenant_id
order by children desc;
```

Expected: one row per distinct `classroom` value (including one row for
`classroom is null`, if any children have none), each showing how many
children used that text and the list of real room names already created
in Settings. Use this to decide, for each distinct `classroom` string,
which real room (if any) it should map to — then assign children to that
room one at a time from `/children/[childId]` (there is no bulk-assign
tool; see Section 9). Do **not** attempt to script an automatic
`classroom` → `room_id` match from this output — the whole reason this
migration ships without a backfill is that nobody has verified `classroom`
is clean or consistent enough to match automatically.

## 4. `on delete set null` preserves children — rolled back, does not touch real data

```sql
begin;

-- Pick any existing room and any existing child (any status) to test against:
select id, name from public.rooms where tenant_id = '<TENANT_ID>'::uuid limit 5;
select id, full_name, room_id from public.children where tenant_id = '<TENANT_ID>'::uuid limit 5;

update public.children set room_id = '<ROOM_ID>' where id = '<CHILD_ID>';

delete from public.rooms where id = '<ROOM_ID>';

select id, full_name, room_id from public.children where id = '<CHILD_ID>';

rollback;
```

Expected: after the `delete`, the `select` still returns the child row
(it is not deleted) with `room_id` now `null` (not the deleted room's id).
The final `rollback` discards all of this, including the `delete` — real
data is untouched either way, but you should see the `null` before you
roll back, to actually prove the FK behaves as `on delete set null` and
not `on delete cascade`.

## 5. Age-band constraint holds — rolled back

The brief's literal form of this check (`update public.rooms set
min_age_months = 24, max_age_months = 12` with no `where` clause) would
update **every room across every tenant** in the database. Scope it to one
room and wrap it, same as every other destructive check in this document:

```sql
begin;

select id, name, min_age_months, max_age_months from public.rooms
where tenant_id = '<TENANT_ID>'::uuid limit 1;

update public.rooms
set min_age_months = 24, max_age_months = 12
where id = '<ROOM_ID>';

rollback;
```

Expected: the `update` fails with a `check_violation` on
`rooms_age_band_ordered` (`min_age_months <= max_age_months` is violated:
24 > 12). The `rollback` is a formality here since the failed statement
never committed anything, but run it anyway to close the transaction
cleanly.

## 6. Capacity constraint holds — rolled back

Same fix as Section 5 — the brief's form has no `where` clause either:

```sql
begin;

select id, name, capacity from public.rooms
where tenant_id = '<TENANT_ID>'::uuid limit 1;

update public.rooms set capacity = 0 where id = '<ROOM_ID>';

rollback;
```

Expected: the `update` fails with a `check_violation` on
`rooms_capacity_positive` (`capacity is null or capacity > 0`).

## 7. The partial index is used

```sql
explain analyze
select id from public.children
where tenant_id = '<TENANT_ID>'::uuid and status = 'waitlisted'
order by waitlisted_at;
```

Expected: the plan mentions `children_waitlist_idx`. **Caveat:** on a
brand-new production database, this table may have very few `waitlisted`
rows right after applying — Postgres's planner can reasonably choose a
sequential scan over the index on a tiny table, and that is a correct
optimizer decision, not a broken index. If you see a `Seq Scan` instead,
either re-run this after real waitlist volume exists, or force the
comparison temporarily:

```sql
set enable_seqscan = off;
explain analyze
select id from public.children
where tenant_id = '<TENANT_ID>'::uuid and status = 'waitlisted'
order by waitlisted_at;
set enable_seqscan = on;
```

With sequential scan disabled, the plan must be able to use
`children_waitlist_idx` (an `Index Scan` appears) — if it still can't,
that's a real problem (the index is malformed or doesn't cover this
query), not a planner preference.

## 8. Staff still cannot read children directly

From a **staff**-role session (their own JWT, not service_role):

```sql
select * from public.children;
```

Expected: **zero rows** — this migration adds no RLS policies at all to
`children` or `rooms`; `children_select` from
`20260802224828_children_and_guardians.sql` (director/platform_admin only)
is untouched. Then, same session:

```sql
select * from public.child_balance_status;
```

Expected: their roster comes back (one row per child in their tenant/
locations, per the billing migrations' view) — proving this migration
didn't accidentally tighten or loosen that separate boundary either.

Then confirm the same boundary holds in the app, not just in SQL: log in to
the portal **as a staff user** (not director/platform_admin) and navigate
to `/waitlist` directly (type the URL or follow a bookmark — there is no
nav link for staff to click, since Nav only shows Waitlist to
director/platform_admin). Expected: staff are redirected to `/dashboard` (the page's
`requireRole(["director", "platform_admin"])` check, `src/lib/auth/dal.ts`,
calls `redirect("/dashboard")` for any role not in the allowed list) rather
than shown the waitlist or an error page.
The SQL check above proves the data boundary; this proves the page-level
boundary actually gates the route in the running app.

## 9. Full UI lifecycle as a director

**Before you start:** Settings currently has **no input for room
`capacity`, `min_age_months`, or `max_age_months`** — the "Rooms" card in
`/settings` only has fields for room name and location
(`src/app/(app)/settings/page.tsx`), even though `/waitlist` links to it
with "Set room capacity →". Until that control ships, set capacity via SQL
to walk through this check:

```sql
update public.rooms set capacity = 8 where id = '<ROOM_ID>'::uuid;
```

Then, in the browser:

1. Open `/children/[childId]` for a real (or test) child. Set **Status**
   to `Waitlisted`, set **Waitlisted on** to today's date, optionally pick
   a **Room**, and Save.
2. Open `/waitlist`. Confirm the child appears under the room you picked
   (or under "Unassigned" if you left Room blank), with "Waiting 0 days"
   (or the correct count if you backdated "Waitlisted on").
3. On that same row, use the **Enroll** control: set a start date and
   submit. Confirm the child disappears from `/waitlist` and their
   `/children/[childId]` page now shows Status = `Active` with that start
   date.
4. Confirm billing picked it up: run (or wait for the next scheduled run
   of) `generate_recurring_charges('<TENANT_ID>'::uuid, '<PERIOD_START>'::date)`
   for the period containing the start date you used, then:
   ```sql
   select id, subsidy_amount, parent_amount, created_at
   from public.charges
   where child_id = '<CHILD_ID>'
   order by created_at desc limit 1;
   ```
   Expected: a charge row exists, prorated from the start date (see
   `docs/BILLING-APPLY-CHECKLIST.md` §1–3 for the underlying proration
   rules this reuses).

   **Warning — the 06:00 cron will not do this for you on a back-dated
   enrollment.** `generate_recurring_charges_impl` only opens a period when
   `p_on` IS that period's start day (see
   `supabase/migrations/20260814120700_attach_pending_credits.sql`). If you
   enroll a child with a `start_date` in a period whose start day has
   already passed, the scheduled cron run tomorrow will run for *tomorrow's*
   date, not for the past period-start day this child needs — it will never
   retroactively bill that partial period on its own. You must run the
   manual `generate_recurring_charges(...)` call above yourself, for the
   period containing the start date, or that child is billed nothing until
   the *next* period begins. The enroll form's default start date now steers
   directors toward the next period start specifically to avoid this trap
   (see the final-review-fixes Important 1 finding), but a director can
   still type an earlier date by hand, so this manual step remains
   necessary whenever they do.

## 10. Soft-deactivated rooms fold into "Unassigned", not disappear

Rooms are never deleted — only `is_active = false`. Settings also has **no
deactivate control for rooms** (only kiosk devices have one), so this is
SQL-only for now too. This check needs **committed** state, not a rolled-
back transaction — the app reads it through its own connection in the
browser, so a `rollback` here would make the change invisible to `/waitlist`
before you even get to look:

1. Pick (or create) a room with at least one waitlisted child assigned to
   it via `/children/[childId]` → Room, per Section 9.
2. Deactivate that room:
   ```sql
   update public.rooms set is_active = false where id = '<ROOM_ID>'::uuid;
   ```
3. Reload `/waitlist`. Expected: the room's own section is gone (the
   query only loads `is_active = true` rooms), and the child who was
   waiting for it now appears under **"Unassigned"** — not missing from
   the page entirely.
4. Restore the room afterward (or leave it deactivated if it genuinely
   should be retired):
   ```sql
   update public.rooms set is_active = true where id = '<ROOM_ID>'::uuid;
   ```

## 11. Waitlist ordering: `waitlisted_at` ascending, `created_at` tiebreak, undated last

Families must sort oldest-waiting-first, with two same-day entries broken
by record creation order, and any entry with no `waitlisted_at` pushed to
the **bottom** rather than jumping the queue. Set up four children (real
or disposable test rows, clearly named e.g. `ZZ_TEST A`/`B`/`C`/`D` so
they're easy to find and remove afterward) with:

```sql
update public.children set status = 'waitlisted', waitlisted_at = '2026-08-01' where id = '<CHILD_A>';
update public.children set status = 'waitlisted', waitlisted_at = '2026-08-05' where id = '<CHILD_B>';
update public.children set status = 'waitlisted', waitlisted_at = '2026-08-05' where id = '<CHILD_C>';
update public.children set status = 'waitlisted', waitlisted_at = null       where id = '<CHILD_D>';
```

(B and C share `waitlisted_at` on purpose, to exercise the `created_at`
tiebreak — whichever of the two was created first, e.g. inserted earlier
via `/children`, must render first.)

Query the order the app is supposed to produce:

```sql
select id, full_name, waitlisted_at, created_at
from public.children
where tenant_id = '<TENANT_ID>'::uuid and status = 'waitlisted'
  and id in ('<CHILD_A>', '<CHILD_B>', '<CHILD_C>', '<CHILD_D>')
order by waitlisted_at asc nulls last, created_at asc;
```

Expected order: A, then whichever of B/C has the earlier `created_at`,
then the other, then **D last** — even though D has no `waitlisted_at` at
all, it must not sort before A/B/C. Then reload `/waitlist` (all four
should land in the same room group, or Unassigned, so they're numbered
1–4 in one list) and confirm the on-screen numbered order matches this
query exactly, top to bottom.

Clean up afterward — restore each child's original `status`/`waitlisted_at`
if they were real records, or delete them if they were disposable test
rows created solely for this check.

## 12. Cleanup

Sections 9–11 commit real rows (the app must observe them through its own
connection, so they can't be run inside a transaction you roll back).
Before considering this checklist complete:

- Restore or remove any test child/room rows created solely to exercise
  these checks (anything you named `ZZ_TEST*` or otherwise marked as
  throwaway).
- Restore `is_active`, `capacity`, `status`, and `waitlisted_at` on any
  **real** child/room record you modified back to its correct value if the
  test values weren't meant to stick.
- Re-run Section 2's `unassigned = total_children` query one more time —
  it should no longer hold exactly (you've now legitimately assigned
  rooms and enrolled some waitlisted children in Sections 9–11), but every
  child that still has `status = 'waitlisted'` and no room chosen should
  still show `room_id is null`, and nothing should look changed for any
  child you never touched.
