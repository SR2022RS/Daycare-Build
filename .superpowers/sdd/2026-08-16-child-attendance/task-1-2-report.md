# Task 1 & 2 report: child attendance schema + kiosk RPCs

## Files created

1. `supabase/migrations/20260817120000_child_attendance.sql` — `guardian_pins`, `child_attendance`, `children.pickup_code_word`, `kiosk_pin_attempts.guardian_id`. Written verbatim from task-1-brief.md.
2. `supabase/migrations/20260817120100_child_attendance_rpcs.sql` — `admin_set_guardian_pin`, `kiosk_identify_guardian_pin`, `kiosk_check_child_in`, `kiosk_check_child_out`.
3. `supabase/migrations/20260817120200_kiosk_guardian_sessions.sql` — the controller-ruled addition: `kiosk_sessions.profile_id` made nullable, `guardian_id` column added, `num_nonnulls(profile_id, guardian_id) = 1` check constraint.

Commits (in order): `406f40e` (tables + sessions), `cc9ab98` (RPCs). No file outside these three was staged or touched — verified with `git status --short` before each commit.

## How the PIN architecture was mirrored

- `guardian_pins` has the exact same shape as `profile_pins`: primary key on the owner id, `tenant_id`, `pin_hash`, `failed_attempts`, `locked_until`, `updated_at`. RLS is enabled but **zero policies are defined** — same as `profile_pins`. No `select`/`insert`/`update`/`delete` policy exists for `guardian_pins`, so every anon/authenticated client read is denied by default, and only `SECURITY DEFINER` functions (which bypass RLS) or the service-role admin client can touch the hash.
- `admin_set_guardian_pin` is a line-for-line structural copy of `admin_set_staff_pin`: same role check (`director`/`platform_admin`), same `^[0-9]{4,6}$` regex gate, same tenant-scoped collision scan using `crypt()` before insert, same `on conflict (...) do update` upsert resetting `failed_attempts`/`locked_until`.
- `kiosk_identify_guardian_pin` is a line-for-line structural copy of `kiosk_identify_pin`: `select ... for update` on the `kiosk_devices` row (locks it for the transaction so concurrent guesses serialize through the lockout counter), `is_active`/`locked_until` checks, `last_seen_at` touch, PIN regex gate, a `for r in (...) loop` candidate scan with `crypt(p_pin, r.pin_hash) = r.pin_hash`, then the same success/failure branches: reset-and-log-success, or increment-and-maybe-lock-for-15-minutes, logging every attempt to `kiosk_pin_attempts` (now with `guardian_id` set instead of `profile_id`). Device-scoped lockout is intentionally shared with staff PIN attempts against the same kiosk — one `failed_attempts` counter per terminal, consistent with the existing rationale that a wrong PIN doesn't reveal who it was meant for.
- The one structural departure, exactly as instructed by the brief: the candidate loop scopes by `guardian_pins.tenant_id = v_device.tenant_id` **and** `exists (... child_guardians ... children ... where c.location_id = v_device.location_id and c.status = 'active')`, instead of the staff version's `join staff_locations`. Guardians have no location-membership table, so the location scope comes transitively through having an active child enrolled at that location.

## Grant/revoke lines used, and why

- `admin_set_guardian_pin(uuid, text)`: `revoke all on function ... from public, anon;` then `grant execute ... to authenticated;` — director-callable from an authenticated session, matching `admin_set_staff_pin`'s grants exactly.
- `kiosk_identify_guardian_pin(uuid, text)`: `revoke all on function ... from public, anon, authenticated;` then `grant execute ... to service_role;` — matching `kiosk_identify_pin`. The caller has no session (kiosk is unauthenticated), so `authenticated` must be revoked too, not just `anon`.
- `kiosk_check_child_in(uuid, uuid, uuid, uuid)` and `kiosk_check_child_out(uuid, uuid, uuid, text)`: same service-role-only pattern — `revoke all ... from public, anon, authenticated;` then `grant execute ... to service_role;`. Both are only ever called from the kiosk's `"use server"` action via the service-role admin client, never from a browser session, so `authenticated` is revoked exactly like the PIN identify function.
- Every revoke lists `public` plus the specific role(s), never `revoke ... from public` alone, per the explicit constraint that Supabase's default schema privileges grant EXECUTE directly to each role at function-creation time independent of the PUBLIC pseudo-role.
- `search_path = public, extensions` on the two PIN functions (they call `crypt`/`gen_salt`, which live in `extensions`). `search_path = public` only (no `extensions`) on the two child-attendance functions, since neither touches pgcrypto.

## Judgment calls

1. **`for update` on the open-visit row in `kiosk_check_child_out`.** The brief didn't explicitly ask for a row lock here (only the device-row lock in the PIN functions was specified), but I added it: it locks the matched `child_attendance` row for the transaction so two concurrent check-out taps against the same visit can't both succeed — the second sees the row already closed after the first commits and correctly raises `no_open_visit` instead of racing past it. This is the same defensive pattern the existing code already uses for `kiosk_devices`, applied consistently. `kiosk_check_child_in` was left without an equivalent lock on the `children`/`child_attendance` read, since the brief describes a plain select-then-insert and the partial unique index (`child_attendance_one_open_visit`) is the actual backstop against a genuine double-insert race — a rare concurrent double-tap would surface as a constraint-violation error rather than a friendly no-op, which I judged acceptable rather than over-engineering a lock the brief didn't ask for.
2. **No guardian-to-child ownership check inside `kiosk_check_child_in`/`kiosk_check_child_out`.** The functions trust whatever `p_guardian_id`/`p_staff_id` the caller passes, without re-verifying that guardian is actually linked to that specific child via `child_guardians`. The brief's spec for these two functions doesn't call for that check, and the trust boundary is the service-role-only grant: only the kiosk's server action can call them, and that action is expected to have already validated the guardian (via `kiosk_identify_guardian_pin`, which does scope to guardians with an active child at the device's location) before invoking check-in/out. I did not add extra scoping beyond what the brief specified, to stay a faithful mirror rather than invent new authorization logic — but this is worth a second look in code review, since nothing in the SQL itself stops a validated kiosk session from checking in/out a child the guardian isn't linked to if the calling server action has a bug.
3. **Error message text for the two "exactly one actor" guards and `'child not active'`** aren't specified verbatim in the brief (only `'pin_taken'` and `no_open_visit` are exact strings). I chose short, lower-case, non-punctuated messages consistent with the existing house style (`'not authorized'`, `'PIN must be 4 to 6 digits'`).
4. **Commit message for commit 1** — the brief only gives an exact message for the Task 1 (tables) file in isolation, but the controller ruling folds `kiosk_guardian_sessions` into the same commit. I reused the brief's message verbatim and appended a paragraph explaining the `kiosk_sessions` widening and why it was pulled forward from Task 4, rather than inventing a wholly new message.

## What could not be verified without a database

Per instructions, no `supabase` command was run and nothing was applied to any database (the target is live production and unlinked). Specifically unverified:

- That the SQL actually parses and applies cleanly against the real schema (column names, types, and existing constraints referenced — `children.status`, `children.location_id`, `children.room_id`, `child_guardians.guardian_id`/`child_id`, `guardians.tenant_id`, `kiosk_devices.*`, `kiosk_pin_attempts.*`, `kiosk_sessions.profile_id` — were all confirmed by reading the migrations that created them, but never executed).
- That `num_nonnulls()` behaves as expected inside a `check` constraint on `kiosk_sessions` at scale, and that no existing `kiosk_sessions` rows would violate the new constraint (all existing rows have `profile_id` set and `guardian_id` null, so `num_nonnulls` = 1 for every row — this was reasoned through, not tested).
- That `crypt()`/`gen_salt('bf')` resolve correctly via `set search_path = public, extensions` in this project's actual `extensions` schema installation (mirrors the existing functions exactly, so expected to work, but not executed).
- Runtime behavior of the lockout/candidate-loop logic under real concurrent load.
- `npx tsc --noEmit` and `npm test` (55/55) both pass, but neither exercises SQL — they only confirm the rest of the codebase still compiles/tests clean with these new files present.

---

# Fix round 1

Reviewer verdict: spec compliance ✅ on both tasks; grants, `search_path`, guardian candidate
scoping, lockout parity, check constraints, and the `for update` on check-out were all confirmed
correct. Four findings fixed, plus one controller ruling (new scope). All changes stay inside the
already-unapplied migration files, so findings 1-4 were fixed by editing
`20260817120000_child_attendance.sql` and `20260817120100_child_attendance_rpcs.sql` directly
rather than layering a patch migration on top of SQL that has never touched a real database. The
controller ruling explicitly called for a `create or replace` in a new fourth migration, so that
one *is* a new file.

## Finding-by-finding

1. **🔴 `p_guardian_id` taken on faith** — fixed in both `kiosk_check_child_in` and
   `kiosk_check_child_out` (`20260817120100_child_attendance_rpcs.sql`). Added, immediately after
   the child/visit is resolved: `if p_guardian_id is not null and not exists (select 1 from
   child_guardians cg where cg.child_id = p_child_id and cg.guardian_id = p_guardian_id) then
   raise exception 'guardian_not_linked'; end if;`. A staff-vouched check-in/out (`p_guardian_id`
   null) is untouched, so the tier-2 authorized-non-guardian pickup path still works.
2. **🟠 `p_room_id` unvalidated** — fixed in `kiosk_check_child_in`. After `v_child` is fetched,
   added `if p_room_id is not null and not exists (select 1 from rooms r where r.id = p_room_id
   and r.location_id = v_child.location_id) then raise exception 'room_not_at_location'; end if;`
   before the `coalesce` that resolves the effective room.
3. **🟠 check-in idempotency is select-then-insert** — fixed in `kiosk_check_child_in`. The
   select-then-check remains as the fast path (avoids a needless failed insert on the common
   double-tap), but the insert is now followed by `exception when unique_violation then select id
   into v_new_id from child_attendance where child_id = p_child_id and checked_out_at is null;
   return v_new_id; end;` so a genuine race between two concurrent taps still converges on the
   same visit id instead of surfacing a bare `unique_violation` to the kiosk.
4. **🟠 `p_staff_id` unvalidated** — fixed in both functions, same shape as finding 1:
   `if p_staff_id is not null and not exists (select 1 from profiles pr where pr.id = p_staff_id
   and pr.tenant_id = v_child.tenant_id /* or v_visit_tenant_id in check-out */) then raise
   exception 'staff_not_in_tenant'; end if;`. `kiosk_check_child_out`'s initial select was widened
   from `select id into v_visit_id` to `select id, tenant_id into v_visit_id, v_visit_tenant_id` so
   the tenant is available for this check without a second query.

All four checks were placed after the row is fetched/locked (`v_child` in check-in, the `for
update`-locked open visit in check-out) and before the write, so a rejected claim never touches
`child_attendance`. Updated the `kiosk_check_child_in`/`kiosk_check_child_out` banner comments to
explain why these re-verifications exist: `service_role`-only defends the network boundary (no
anon/authenticated caller can reach these functions at all), not a bug in a future caller that
passes a mismatched id on trust.

## Controller ruling — guardian lockout separated from staff lockout

New file: `supabase/migrations/20260817120300_guardian_lockout.sql`.

- `alter table kiosk_devices add column guardian_failed_attempts int not null default 0, add
  column guardian_locked_until timestamptz;`
- `create or replace function kiosk_identify_guardian_pin(...)` — identical to the version in
  `20260817120100_child_attendance_rpcs.sql` in every respect (device lookup + `for update`,
  `is_active`/lockout check, `last_seen_at` touch, PIN regex gate, tenant +
  active-child-at-location candidate scoping, `crypt` loop, attempt logging) except every read/
  write of `failed_attempts`/`locked_until` now targets `guardian_failed_attempts`/
  `guardian_locked_until` instead. Same 5-strike / 15-minute policy, same per-device scope (the
  terminal is still the right thing to rate-limit, since a wrong PIN doesn't reveal who it was
  meant for) — just a second, independent counter so five fumbled parent PINs at drop-off can no
  longer lock staff out of clocking in.
- Re-asserted `revoke all on function ... from public, anon, authenticated;` /
  `grant execute ... to service_role;` in the new migration even though `create or replace` doesn't
  touch grants — so the function's access shape is self-evident from this migration alone, matching
  every other function in the kiosk RPC family.
- Updated the original `kiosk_identify_guardian_pin` comment banner in
  `20260817120100_child_attendance_rpcs.sql` to flag that this migration supersedes its lockout
  columns, so a future reader of that file isn't misled by the now-stale "same device-scoped
  lockout" claim.

## Deferred items (not fixed, per instruction)

- `guardian_pins.failed_attempts`/`locked_until` are written by `admin_set_guardian_pin`'s upsert
  but never read (lockout is device-scoped, now via `kiosk_devices.guardian_failed_attempts`/
  `guardian_locked_until`). Added a one-line comment on the columns in
  `20260817120000_child_attendance.sql` saying so, so the next reader doesn't wire them up.
- `kiosk_pin_attempts` failure branches (`invalid_pin`, `locked`) still log neither `profile_id`
  nor `guardian_id`, so an auditor can't distinguish a failed guardian attempt from a failed staff
  one at that device. Left as-is per the deferral; worth an `actor_kind` column later.

## Verification

- `git status --short` before committing showed only the three touched/added migration files.
- `npx tsc --noEmit`: clean, no output.
- `npm test`: 55/55 passed (6 test files), unchanged from before — these are SQL-only changes.
- Still unverified against a real database, per instructions (no `supabase` command run): whether
  `exception when unique_violation` correctly scopes to only the insert (and not, say, an unrelated
  constraint on a future column added to `child_attendance`), and whether the new
  `guardian_failed_attempts`/`guardian_locked_until` columns and the `create or replace` apply
  cleanly against the live schema.
