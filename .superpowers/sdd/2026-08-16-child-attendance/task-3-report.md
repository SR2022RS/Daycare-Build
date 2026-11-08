# Task 3 Report: Types and pure logic

## Files changed

- `src/types/database.types.ts` — additive only (staged for commit)
- `src/lib/attendance/child-visits.ts` — new (staged for commit)
- `src/lib/attendance/child-visits.test.ts` — new (staged for commit)
- `src/lib/kiosk/actions.ts` — **not staged**, see "Out-of-scope fix" below

## `database.types.ts` additions, checked against the migrations

### `guardian_pins` (new table) — from `20260817120000_child_attendance.sql`
Row/Insert match the CREATE TABLE exactly:
- `guardian_id: string` (PK, references `guardians`)
- `tenant_id: string`
- `pin_hash: string`
- `failed_attempts: number` (`default 0` → Insert-optional)
- `locked_until: string | null`
- `updated_at: string` (`default now()` → Insert-optional)

No FKs added to `Relationships` (matches `profile_pins`, its structural twin, which also has `Relationships: []` despite having a real FK — following the existing convention for that table rather than introducing a new pattern).

### `child_attendance` (new table) — from same migration
Row/Insert match column-for-column:
`id, tenant_id, location_id, child_id, room_id (nullable), checked_in_at (default now()), checked_out_at (nullable), in_by_guardian_id (nullable), in_by_staff_id (nullable), out_by_guardian_id (nullable), out_by_staff_id (nullable), out_override_reason (nullable), created_at`.
Added `Relationships` entries for `child_id → children.id` and `room_id → rooms.id` (the two FKs to tables already present in the type file; did not add entries for `in_by_guardian_id`/`out_by_guardian_id` → `guardians` or the `*_staff_id` → `profiles` FKs, to match the file's existing convention of keeping `Relationships` sparse — e.g. `children` only lists `location_id`/`room_id`, not `tenant_id`).

### `children.pickup_code_word`
Added `pickup_code_word: string | null` to Row and `pickup_code_word?: string | null` to Insert. Matches `alter table public.children add column pickup_code_word text;` (nullable, no default).

### `kiosk_pin_attempts.guardian_id`
Added `guardian_id: string | null` to Row and `guardian_id?: string | null` to Insert, alongside the existing `profile_id`. Matches `alter table public.kiosk_pin_attempts add column guardian_id uuid references public.guardians (id) on delete set null;`.

### Controller-ruling additions (migration `20260817120200` and `20260817120300`)
- `kiosk_sessions.profile_id`: changed from `string` to `string | null` in Row and from required to `profile_id?: string | null` in Insert — matches `alter table ... alter column profile_id drop not null`.
- `kiosk_sessions.guardian_id`: added `string | null` to Row, `guardian_id?: string | null` to Insert — matches the new column + `kiosk_sessions_actor` check constraint (exactly one of `profile_id`/`guardian_id`).
- `kiosk_devices.guardian_failed_attempts`: added `number` to Row, `guardian_failed_attempts?: number` to Insert (matches `not null default 0`).
- `kiosk_devices.guardian_locked_until`: added `string | null` to Row and Insert (matches nullable timestamptz, no default).

## `Functions` block additions — argument names checked token-for-token against the migrations

- `admin_set_guardian_pin(p_guardian_id uuid, p_pin text) returns void` → `Args: { p_guardian_id: string; p_pin: string }; Returns: undefined;`
- `kiosk_identify_guardian_pin(p_device_token uuid, p_pin text) returns uuid` → `Args: { p_device_token: string; p_pin: string }; Returns: string | null;` (mirrors `kiosk_identify_pin`'s existing shape — nullable return, since the function returns `null` on no match/lockout)
- `kiosk_check_child_in(p_child_id uuid, p_room_id uuid, p_guardian_id uuid, p_staff_id uuid) returns uuid` → `Args: { p_child_id: string; p_room_id: string | null; p_guardian_id: string | null; p_staff_id: string | null }; Returns: string;` (only `p_child_id` is non-nullable in the SQL signature; `p_room_id`/`p_guardian_id`/`p_staff_id` are all nullable per the function body's `num_nonnulls` checks and `coalesce(p_room_id, ...)`. Return is `uuid` not null — the function always either returns an id or raises.)
- `kiosk_check_child_out(p_child_id uuid, p_guardian_id uuid, p_staff_id uuid, p_override_reason text) returns uuid` → `Args: { p_child_id: string; p_guardian_id: string | null; p_staff_id: string | null; p_override_reason: string | null }; Returns: string;`

Argument **order and names** were copied verbatim from each migration's `create function` signature — this was the part flagged as highest risk (wrong names fail at runtime, not compile time).

## `src/lib/attendance/child-visits.ts` and test file

Copied verbatim from the brief's Step 4/Step 2 code blocks — `PresentChild` interface, `hoursPresent`, `isStaleVisit`, and the 6 test cases. No deviation.

## Verification output

```
$ npx tsc --noEmit
(clean, no output)

$ npx vitest run
 Test Files  7 passed (7)
      Tests  61 passed (61)
```

(55 pre-existing + 6 new in `child-visits.test.ts` = 61.)

## Judgment calls / things done differently than a literal reading of the brief

1. **Out-of-scope fix to `src/lib/kiosk/actions.ts` (not staged).** The controller ruling requires `kiosk_sessions.profile_id` to become `string | null`. That alone broke `npx tsc --noEmit` in an unrelated, already-uncommitted file: `src/lib/kiosk/actions.ts` (staff clock-in/out/break/room-transfer/incident actions) reads `session.profile_id` in 6 places assuming it's always a `string`. Since "tsc clean" is a hard requirement and this breakage is a direct, unavoidable consequence of the mandated type change (not something in my 3 files could fix), I added a minimal null-guard in that file's `resolveSession()`: a session with a null `profile_id` (i.e. a guardian session) is now treated as invalid for these staff-only actions, same as an expired session. This is semantically correct (guardian sessions genuinely shouldn't authorize staff clock actions) and not just a type-checker workaround. **I did not stage this file** per the instruction to stage only the 3 named files — it's a working-tree change only. Flagging for the controller to decide whether it should ride along in this commit, a follow-up task, or be handled differently.
2. **`guardian_pins` and `child_attendance` `Relationships` arrays.** Kept sparse, following the file's existing convention (e.g. `children`, `profile_pins`) rather than exhaustively listing every FK. `child_attendance` lists only `child_id` and `room_id` (both point to tables already modeled with relationships elsewhere); `guardian_pins` has `Relationships: []` like its structural twin `profile_pins`.
3. **Placement in the file.** Added `guardian_pins` and `child_attendance` immediately after `kiosk_pin_attempts` (before `attendance_breaks`), since that's a contiguous open spot and keeps the diff purely additive/append-style rather than interleaving into distant sections.
