# Tasks 1-2 — fix round 1

Spec compliance came back ✅ on both. Grants, `search_path`, guardian candidate scoping,
lockout parity with `kiosk_identify_pin`, the check constraints, and the `for update` you added
to check-out were all verified correct. Four findings to fix, plus one controller ruling.

## 🔴 CRITICAL 1 — `p_guardian_id` is taken on faith

`20260817120100_child_attendance_rpcs.sql` — `kiosk_check_child_in` (~:165) and
`kiosk_check_child_out` (~:222) accept `p_guardian_id` without verifying that guardian is linked
to that child via `child_guardians`.

Blast radius: a mismatched id writes a row asserting *Guardian X collected Child Y*, marks the
child departed, removes them from the live board and the ratio numerator, and is visible to every
staff member and director. It is exactly the artifact a licensing or subsidy audit reads. A bug in
one server action does not produce a soft error here — it produces a falsified custody record that
looks authoritative.

It also breaks the house pattern: `kiosk_identify_pin` builds its own candidate set rather than
accepting one, `admin_set_staff_pin` re-derives role and tenant, and `admin_set_guardian_pin` in
this same migration re-verifies the target guardian's tenant. These two functions are the only
members of the family taking an identity claim on trust. `service_role`-only defends against the
browser, not against a future caller.

**Fix** — in both functions, after the `num_nonnulls` guard:

```sql
if p_guardian_id is not null and not exists (
  select 1 from public.child_guardians cg
  where cg.child_id = p_child_id and cg.guardian_id = p_guardian_id
) then
  raise exception 'guardian_not_linked';
end if;
```

This blocks no intended flow: a tier-2 authorized-non-guardian pickup records `out_by_staff_id`
plus `out_override_reason` with `p_guardian_id` null.

## 🟠 IMPORTANT 2 — `p_room_id` is unvalidated

`kiosk_check_child_in` (~:190) does `v_room_id := coalesce(p_room_id, v_child.room_id)` and never
checks the room. The FK accepts any room in any tenant, silently corrupting the occupancy and
ratio views.

```sql
if p_room_id is not null and not exists (
  select 1 from public.rooms r
  where r.id = p_room_id and r.location_id = v_child.location_id
) then
  raise exception 'room_not_at_location';
end if;
```

## 🟠 IMPORTANT 3 — check-in idempotency is select-then-insert

(~:192-208) A genuine double-tap races between the select and the insert and raises a bare
`unique_violation`, when the spec calls for a silent no-op returning the existing visit. Wrap the
insert:

```sql
exception when unique_violation then
  select id into v_new_id
  from public.child_attendance
  where child_id = p_child_id and checked_out_at is null;
  return v_new_id;
```

## 🟠 IMPORTANT 4 — `p_staff_id` is unvalidated

Same class as 1: a profile from any tenant satisfies the FK. Verify it belongs to the child's
tenant before writing.

## CONTROLLER RULING — separate the guardian lockout from the staff lockout

The reviewer raised this as an operational note rather than a defect, and it is my brief's fault,
but it fails at the worst possible moment: `kiosk_devices.failed_attempts` / `locked_until` are
shared between staff and guardian PIN entry, so **five fumbled parent PINs during morning
drop-off lock staff out of clocking in for 15 minutes.** Parents fumbling PINs at 8am is the
normal case, not the abuse case.

Add a fourth migration `supabase/migrations/20260817120300_guardian_lockout.sql` adding
`guardian_failed_attempts int not null default 0` and `guardian_locked_until timestamptz` to
`kiosk_devices`, and change `kiosk_identify_guardian_pin` (via `create or replace`) to read and
write those columns instead of the staff ones. Keep the same 5-strike / 15-minute policy and the
same `for update` lock. Re-assert its revoke/grant lines in the new migration.

## Deferred, do NOT fix

- `guardian_pins.failed_attempts`/`locked_until` are written but never read (lockout is
  device-scoped). Same as `profile_pins` post-kiosk. **Add a one-line comment** saying so, so the
  next reader does not wire them up.
- Failure branches log neither `profile_id` nor `guardian_id`, so an auditor cannot distinguish a
  failed guardian attempt from a failed staff one. Worth an `actor_kind` column later.

## Constraints

- No `git add -A` / `.` / `-a` — stage only the migration files you touch.
- No database or `supabase` commands.
- Do not dispatch subagents.
- `npx tsc --noEmit` clean and `npm test` (55) passing before committing.
- Append your fix report to `.superpowers/sdd/2026-08-16-child-attendance/task-1-2-report.md`.
