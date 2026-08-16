# Child Check-In / Check-Out — Post-Apply Checklist

## Read this first

Nothing in this feature has ever run against a database. Following this
project's established precedent, no SQL was applied by the work that wrote
it: the Supabase project is not linked here and the database is live
production. The migrations were authored, type-checked against
hand-maintained types, and reviewed — nothing more. **Every check below is
one you run yourself, in order, after applying.**

This feature ends at a tablet mounted by a door that parents use
unsupervised, and its output is the attendance record a licensing or subsidy
audit reads. Two consequences shape this checklist:

- **Section 3 (grants) and Section 4 (`guardian_pins` unreadable) are not
  optional.** They are the two checks that prove an unauthenticated kiosk
  cannot become an unauthenticated database client.
- **A wrong attendance row is worse than a missing one.** Section 6 exists
  because a check constraint that silently isn't there produces records that
  look authoritative and are false.

**There are four migrations, not three.** An earlier draft of this feature
listed three; a fourth (`20260817120300_guardian_lockout.sql`) was added
during implementation and is required — see Section 8 for what breaks
without it.

## 0. Order of operations

Apply in plain timestamp order. Do not hand-pick files out of sequence.

1. `supabase/migrations/20260817120000_child_attendance.sql`
   — `guardian_pins`, `child_attendance`, `children.pickup_code_word`,
   `kiosk_pin_attempts.guardian_id`.
2. `supabase/migrations/20260817120100_child_attendance_rpcs.sql`
   — `admin_set_guardian_pin`, `kiosk_identify_guardian_pin`,
   `kiosk_check_child_in`, `kiosk_check_child_out`.
3. `supabase/migrations/20260817120200_kiosk_guardian_sessions.sql`
   — `kiosk_sessions.profile_id` becomes nullable, `guardian_id` added,
   `kiosk_sessions_actor` check constraint added.
4. `supabase/migrations/20260817120300_guardian_lockout.sql`
   — `kiosk_devices.guardian_failed_attempts` / `guardian_locked_until`, and
   a `create or replace` of `kiosk_identify_guardian_pin` to use them.

Prerequisites already in the database, all of which these migrations
reference: `public.children` and `public.guardians`
(`20260802224828_children_and_guardians.sql`), `public.rooms`,
`public.kiosk_devices`, `public.kiosk_sessions`, `public.kiosk_pin_attempts`
(`20260813090000_kiosk_access.sql`), `public.has_location_access` and
`public.current_role` (`20260802141909_rls_policies.sql`), and the
`child_balance_status` view including its location predicate
(`20260814120400` + `20260814120500`) — Section 9's "Who's here" board reads
child names from that view, not from `children`.

`pgcrypto` must be installed and reachable on the `extensions` schema; both
PIN functions are declared `set search_path = public, extensions` and call
`crypt` / `gen_salt`. It is already in use by `20260804090000_pin_login.sql`,
so if staff PINs work today this is satisfied.

**None of the four is re-runnable.** Every `create table`, `create index`,
`add column`, `add constraint` and `create function` is unguarded (no `if
not exists`, and `20260817120100` uses `create function`, not `create or
replace`). A second run fails on the first statement. If one errors partway
through, do not re-run it — inspect what landed and hand-apply the rest.

## 1. Rollback — if a migration half-applies

Run only the parts matching what actually landed. Reverse in the opposite
order to Section 0.

```sql
-- 4
alter table public.kiosk_devices
  drop column if exists guardian_failed_attempts,
  drop column if exists guardian_locked_until;

-- 3
alter table public.kiosk_sessions drop constraint if exists kiosk_sessions_actor;
alter table public.kiosk_sessions drop column if exists guardian_id;
-- Only safe while every existing row still has profile_id set:
alter table public.kiosk_sessions alter column profile_id set not null;

-- 2
drop function if exists public.kiosk_check_child_out(uuid, uuid, uuid, text);
drop function if exists public.kiosk_check_child_in(uuid, uuid, uuid, uuid);
drop function if exists public.kiosk_identify_guardian_pin(uuid, text);
drop function if exists public.admin_set_guardian_pin(uuid, text);

-- 1
alter table public.kiosk_pin_attempts drop column if exists guardian_id;
alter table public.children drop column if exists pickup_code_word;
drop table if exists public.child_attendance;
drop table if exists public.guardian_pins;
```

`drop table public.child_attendance` destroys attendance history. After the
door walkthrough in Section 9 there is real data in it; from that point on,
treat this block as a fix-forward last resort, not a rollback.

## 2. Everything landed

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('guardian_pins', 'child_attendance');
-- expect exactly 2 rows

select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'kiosk_sessions'
  and column_name in ('profile_id', 'guardian_id');
-- expect profile_id YES (nullable), guardian_id YES

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'kiosk_devices'
  and column_name in ('guardian_failed_attempts', 'guardian_locked_until');
-- expect exactly 2 rows

select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('admin_set_guardian_pin', 'kiosk_identify_guardian_pin',
                  'kiosk_check_child_in', 'kiosk_check_child_out');
-- expect exactly 4 rows

select indexname from pg_indexes
where schemaname = 'public' and tablename = 'child_attendance';
-- expect the primary key plus child_attendance_present_idx,
-- child_attendance_child_idx, child_attendance_one_open_visit
```

## 3. No RPC is reachable without the service role

**This is the check that matters most.** The kiosk is unauthenticated; if
any of these three is executable by `anon`, the device token is the only
thing between the public internet and a write to a child's custody record.

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authed,
       has_function_privilege('service_role', p.oid, 'execute')  as svc
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('admin_set_guardian_pin', 'kiosk_identify_guardian_pin',
                    'kiosk_check_child_in', 'kiosk_check_child_out');
```

Expected, exactly:

| function | anon | authenticated | service_role |
|---|---|---|---|
| `admin_set_guardian_pin` | f | **t** | t |
| `kiosk_identify_guardian_pin` | f | f | t |
| `kiosk_check_child_in` | f | f | t |
| `kiosk_check_child_out` | f | f | t |

`admin_set_guardian_pin` is the one exception, and deliberately so: it is
called by a director's own authenticated session from the child page, and it
re-checks `current_role()` and the target guardian's tenant internally. Any
other `t` in the anon column is a stop-everything finding.

Confirm from the client side too. In the SQL editor's role switcher, or with
the anon key from a REST call:

```sql
set local role anon;
select public.kiosk_check_child_in(
  '00000000-0000-0000-0000-000000000000'::uuid, null, null, null);
-- expect: ERROR permission denied for function kiosk_check_child_in
reset role;
```

## 4. `guardian_pins` is unreadable

RLS is enabled with **zero policies**, matching `profile_pins`. Enabled-with-
no-policies means "deny", not "allow" — but that is worth proving rather than
assuming, because the failure mode is silent: an `authenticated` select
returning rows would expose every family's bcrypt hash to any logged-in user.

```sql
select relrowsecurity from pg_class
where oid = 'public.guardian_pins'::regclass;
-- expect: t

select count(*) from pg_policies
where schemaname = 'public' and tablename = 'guardian_pins';
-- expect: 0
```

Then, signed in to the portal as a **director** (the highest-privileged
non-service role), open the browser console on any portal page and run:

```js
const { data, error } = await window.__supabase.from("guardian_pins").select("*");
console.log(data, error);
```

Expect `data` to be `[]` — zero rows, no error. That is RLS refusing, not an
empty table; issue a PIN first (Section 9 step 1) so the table is genuinely
non-empty when you run this, or the check proves nothing.

If your build does not expose a client on `window`, the equivalent is a REST
call with the anon key and a director's access token:

```
curl "$SUPABASE_URL/rest/v1/guardian_pins?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $DIRECTOR_JWT"
```

Expect `[]`.

## 5. One open visit per child

The unique index is what makes check-in idempotent — a double tap at the
kiosk is turned into a no-op by the RPC, which catches `unique_violation`
and returns the existing visit.

Pick a real child id at your location, then:

```sql
-- run twice
select public.kiosk_check_child_in(
  '<child-id>'::uuid, null, '<linked-guardian-id>'::uuid, null);
```

Both calls must return **the same uuid**, and:

```sql
select count(*) from public.child_attendance
where child_id = '<child-id>' and checked_out_at is null;
-- expect: 1
```

Then prove the index itself, independently of the RPC's exception handler:

```sql
insert into public.child_attendance
  (tenant_id, location_id, child_id, checked_in_at, in_by_staff_id)
select tenant_id, location_id, id, now(), null
from public.children where id = '<child-id>';
-- expect: ERROR duplicate key value violates unique constraint
--         "child_attendance_one_open_visit"
--         (or the in-actor constraint below, whichever fires first)
```

## 6. The check constraints hold

Three constraints carry the audit guarantee that a record can always say
whether a guardian authenticated or staff vouched.

```sql
-- Both actors set on the way in -- must fail.
insert into public.child_attendance
  (tenant_id, location_id, child_id, checked_in_at, in_by_guardian_id, in_by_staff_id)
values ('<tenant>', '<location>', '<child>', now(), '<guardian>', '<staff>');
-- expect: ERROR ... violates check constraint "child_attendance_in_actor"

-- Neither actor set -- must also fail.
insert into public.child_attendance
  (tenant_id, location_id, child_id, checked_in_at)
values ('<tenant>', '<location>', '<child>', now());
-- expect: ERROR ... "child_attendance_in_actor"

-- An out-actor while still present -- must fail.
insert into public.child_attendance
  (tenant_id, location_id, child_id, checked_in_at, in_by_staff_id, out_by_staff_id)
values ('<tenant>', '<location>', '<child>', now(), '<staff>', '<staff>');
-- expect: ERROR ... "child_attendance_out_actor"

-- Leaving before arriving -- must fail.
insert into public.child_attendance
  (tenant_id, location_id, child_id, checked_in_at, checked_out_at,
   in_by_staff_id, out_by_staff_id)
values ('<tenant>', '<location>', '<child>', now(), now() - interval '1 hour',
        '<staff>', '<staff>');
-- expect: ERROR ... "child_attendance_out_after_in"
```

And on `kiosk_sessions`:

```sql
insert into public.kiosk_sessions (device_id, tenant_id, location_id, expires_at)
values ('<device>', '<tenant>', '<location>', now() + interval '5 minutes');
-- expect: ERROR ... violates check constraint "kiosk_sessions_actor"
--         (neither profile_id nor guardian_id set)
```

Delete any rows these tests do leave behind before moving on.

## 7. Falsified custody records are refused

The two check RPCs verify their actor arguments rather than trusting them.
Prove it with a guardian who is **not** linked to the child:

```sql
select public.kiosk_check_child_in(
  '<child-id>'::uuid, null, '<unrelated-guardian-id>'::uuid, null);
-- expect: ERROR guardian_not_linked

select public.kiosk_check_child_in(
  '<child-id>'::uuid, '<room-at-another-location>'::uuid,
  '<linked-guardian-id>'::uuid, null);
-- expect: ERROR room_not_at_location
```

Then confirm no row was written:

```sql
select count(*) from public.child_attendance where child_id = '<child-id>';
```

## 8. Guardian lockout is separate from staff lockout

Migration 4 exists for one operational reason: `kiosk_devices.failed_attempts`
was shared between staff and guardian PIN entry, so five fumbled parent PINs
during morning drop-off would lock **staff** out of clocking in for 15
minutes. Parents fumbling a PIN at 8am is the normal case, not the abuse
case.

At a registered kiosk, enter a wrong **guardian** PIN five times, then:

```sql
select failed_attempts, locked_until,
       guardian_failed_attempts, guardian_locked_until
from public.kiosk_devices where id = '<device-id>';
```

Expect `guardian_failed_attempts = 5` and `guardian_locked_until` about 15
minutes out, while `failed_attempts` stays `0` and `locked_until` stays
null. Then, on the same device, confirm a **staff** member can still clock
in normally. Reset with:

```sql
update public.kiosk_devices
set guardian_failed_attempts = 0, guardian_locked_until = null
where id = '<device-id>';
```

## 9. The door walkthrough

The whole feature, end to end, on a real device. Do this last.

1. **Issue a guardian PIN.** Portal → Children → a child → Guardians → the
   guardian's row → **Kiosk PIN**. A four-digit PIN appears once. Write it
   down; it is not recoverable, only replaceable.
2. **Guardian check-in.** At the kiosk, tap **I'm dropping off or picking
   up**, enter that PIN. Their children appear — and only theirs. Tap a
   child. Expect *"<name> is checked in."*, then the list again with that
   child now showing **Here** and a **Check out** action.
3. **Siblings.** If the guardian has more than one child, check the second in
   without re-entering the PIN. Being sent back to the PIN pad between
   siblings is a regression.
4. **The board.** Portal → Children → **Who's here**. The child appears under
   their room. A child with no room, or whose room has been closed, appears
   under **Unassigned** — they must never simply vanish.
5. **The dashboard.** The **Children here** metric counts them, and the
   **Rooms & waitlist** panel shows *"1 here"* above the enrolled figure for
   that room.
6. **Staff path.** Tap **I'm staff**, enter a staff PIN, then **Check
   children in/out**. Every active child at this location appears grouped by
   room. Check a different child in from here.
7. **Actor recorded correctly** — the audit guarantee, and the reason for
   step 6:
   ```sql
   select child_id, in_by_guardian_id, in_by_staff_id, room_id, checked_in_at
   from public.child_attendance where checked_out_at is null;
   ```
   The step-2 child must have `in_by_guardian_id` set and `in_by_staff_id`
   null. The step-6 child must be the reverse. If both look the same, the
   record cannot distinguish "the parent authenticated" from "we vouched for
   it", which is the distinction the whole table exists to carry.
8. **Check out.** Back through the guardian path, tap the child again.
   Expect *"<name> is checked out."*, and:
   ```sql
   select checked_out_at, out_by_guardian_id, out_by_staff_id
   from public.child_attendance where child_id = '<child-id>'
   order by checked_in_at desc limit 1;
   ```
   `checked_out_at` set, exactly one out-actor set. The child disappears from
   "Who's here" and from the dashboard count.
9. **Idle reset — the privacy check.** Get the kiosk onto the guardian menu
   with a child's name showing, then leave it untouched for 45 seconds. It
   must return to the neutral **Welcome** screen on its own. Repeat on the
   staff roster screen. A tablet in a public lobby that sits on a child's
   name indefinitely is a privacy failure, and this is the only control
   preventing it.
10. **Wrong PIN says nothing.** Enter a PIN that belongs to nobody, then one
    that belongs to a guardian at a *different* location. Both must produce
    the identical message. A different wording for "no such PIN" versus "not
    your site" is an enumeration oracle.

## 10. What this feature does NOT yet do

State these plainly to whoever is running the centre, because the screens
look finished:

- **Pickup authorization is not enforced.** `children.pickup_code_word` and
  `child_attendance.out_override_reason` exist and are written, but nothing
  validates who is collecting a child. `child_pickup_authorizations`, the
  form-JSONB parser, the code-word UI and the three-tier rule (linked
  guardian / warn-and-override / blocked) are the **second** plan for this
  spec and are not built. Check-out today records who collected a child
  without validating them — exactly what the paper sheet did, and no worse.
- **Ratio tracking is not built.** This feature produces the numerator
  (`checked_out_at is null`). The denominator needs reliable staff→room
  presence, which is a separate gap: room selection at the kiosk is an
  optional dropdown and clock-out never clears it.
- **Open visits are flagged, never auto-closed.** A visit still open after 12
  hours appears on "Who's here" under *Still checked in from earlier* and as
  a dashboard attention item. Nothing invents a departure time, because doing
  so would corrupt the record an audit relies on. Someone has to correct it.
- **Late-pickup fees are not wired.** Billing reserves the concept and
  `checked_out_at` is the natural trigger; nothing connects them yet.
