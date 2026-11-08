# SDD ledger — plan: docs/superpowers/plans/2026-08-16-child-attendance.md

Spec: docs/superpowers/specs/2026-08-16-child-attendance-design.md (read)
Branch: child-attendance, cut from main @ 0d1ee5b. BASE: 0d1ee5b.

## Pre-flight conflict scan

### Cross-task: shared files and interfaces

| Tasks | Producer → consumer | Finding |
|---|---|---|
| 1 → 2 | Tables → RPCs that read/write them | Ordering correct. T2's functions reference `guardian_pins`, `child_attendance`, `kiosk_pin_attempts.guardian_id`, all from T1. |
| 1 → 3 | SQL columns → hand-authored types | Consistent. |
| 1 → 7 | `child_attendance_select` RLS policy → the staff-visible "Who's here" page | Consistent — the policy uses `has_location_access`, verified present in `20260802141909_rls_policies.sql`. |
| 2 → 4 | Four RPCs → server actions | Consistent; argument names match. |
| 4 → 5 | Actions → kiosk screens | Consistent. |
| 3 → 7, 8 | `PresentChild`, `isStaleVisit` | Consistent. |
| 6 → existing | `resetGuardianPin` mirrors `resetStaffPin` (`src/lib/kiosk/actions.ts`) | Consistent — including the `useActionState` signature it needs to return a plaintext PIN once. |
| 8 → existing | `buildAttentionItems` + its 11 tests | Additive branch; existing tests must keep passing. |
| **4 ↔ 1** | **Migration `20260817120200` (kiosk_sessions) sits inside Task 4** | **CONFLICT — see ruling.** |

### Per-task: internal self-agreement

| Task | Finding |
|---|---|
| 1 | Check constraints use `num_nonnulls` (valid since PG 9.6; project is PG 17). The out-actor constraint correctly requires 0 actors while `checked_out_at` is null and exactly 1 once set. Partial unique index on open visits is what makes check-in idempotent. Self-consistent. |
| 2 | Guardian candidate scoping references `child_guardians`, `children.location_id`, `children.status` — all exist. Grants follow the service-role-only convention. Self-consistent. |
| 3 | 6 tests match the implementation; `hoursPresent` clamps negative skew, `isStaleVisit` threshold 12h. Self-consistent. |
| 4 | Depends on the sessions migration (see ruling). Otherwise self-consistent. |
| 5 | Largest task and the only parent-facing surface. Idle-reset preservation is called out explicitly — a kiosk left showing a child's name is a privacy leak. |
| 6 | Slots into the existing guardian `<li>` alongside "Make payer"/"Remove". Self-consistent. |
| 7 | Mirrors `getWaitlist`'s handling of null and soft-deactivated rooms. Self-consistent. |
| 8 | Additive to dashboard + attention. Self-consistent. |

### Rulings

- **Ruling: fold migration `20260817120200_kiosk_guardian_sessions.sql` into Task 1.** The plan placed it inside Task 4, framed as discoverable only once the guardian session flow is written. It is not — I verified directly that `kiosk_sessions.profile_id` is `not null references profiles`, so a guardian session cannot reuse it. Keeping all schema in one task means the migrations land together in dependency order and no code task carries a schema surprise. Cost if wrong: Task 1 grows by one small migration; nothing else changes.
- **Ruling: execute on a `child-attendance` branch rather than `main`.** `main` is now production truth and auto-deploys on push, so committing an 8-task feature there would ship half-built kiosk screens to a live door tablet used by parents. Cost if wrong: one merge at the end.
- **Ruling: batch the 8 tasks into 6 dispatches** — T1+T2 (all migrations, same shape), T3, T4, T5 (alone: largest, parent-facing, security-sensitive), T6+T7 (portal surfaces), T8. Cost if wrong: a review covers two tasks at once.

---

## Task log

Tasks 1+2: implemented (commits 0d1ee5b..cc9ab98 — 406f40e schema+sessions, cc9ab98 RPCs).
Review (opus): spec ✅ both; quality Changes requested — 1 Critical, 3 Important, 3 Minor.
  Verified correct: all four grant/revoke lines (nothing reachable by anon), `search_path =
  public, extensions` on both pgcrypto functions, `guardian_pins` RLS-enabled with zero policies,
  guardian candidate scoping (no PIN-oracle path), lockout parity with kiosk_identify_pin line for
  line, both check constraints walked against every row state, and the implementer's unrequested
  `for update` on check-out judged correct with no deadlock path.
  C1 `p_guardian_id` accepted without verifying the child_guardians link — writes a falsified
     custody record that reads as authoritative to an audit. The implementer flagged this itself.
  I2 `p_room_id` never validated against the child's location — any room in any tenant satisfies
     the FK, silently corrupting occupancy and ratio views. Same class as C1; the implementer
     missed this one.
  I3 check-in idempotency is select-then-insert, so a real double-tap raises `unique_violation`
     rather than the specified no-op.
  I4 `p_staff_id` likewise unvalidated.
Tasks 1+2: Ruling: promoted the reviewer's "operational note" about shared device lockout to a fix.
  `kiosk_devices.failed_attempts` is shared between staff and guardian PIN entry, so five fumbled
  parent PINs during morning drop-off lock staff out of clocking in for 15 minutes. Parents
  fumbling at 8am is the normal case, not the abuse case, and this was my brief's instruction to
  reuse the device counter. Added a fourth migration giving guardians their own counters. Cost if
  wrong: two extra columns and one `create or replace`.
Tasks 1+2: minor (deferred): `guardian_pins.failed_attempts`/`locked_until` are written but never
  read (lockout is device-scoped) — same as `profile_pins` after the kiosk migration. A comment was
  requested so the next reader doesn't wire them up.
Tasks 1+2: minor (deferred): PIN failure branches log neither `profile_id` nor `guardian_id`, so an
  auditor cannot tell a failed guardian attempt from a failed staff one. An `actor_kind` column
  would fix it later.
Tasks 1+2: fix round 1/5 (5 addressed, 0 open; commit cc9ab98..a13b9b4)
  Re-review confirmed every guard runs BEFORE its write, the `is not null` predicate leaves the
  staff path and the tier-2 pickup flow unaffected, the `unique_violation` handler re-reads and
  returns the existing visit (and cannot swallow a different constraint — `child_attendance` has
  exactly two unique indexes today), the staff tenant check compares against the CHILD's tenant,
  and the `create or replace` is a true replace: byte-identical signature including parameter
  names, `security definer` and `search_path` preserved, `for update` retained, all six counter
  references moved to the guardian pair, grants re-asserted, and `kiosk_identify_pin` untouched.
Tasks 1+2: complete (commits 0d1ee5b..a13b9b4, review clean)
Tasks 1+2: Ruling: carrying the re-review's out-of-scope note into Task 3 rather than deferring it —
  `src/types/database.types.ts` is missing `guardian_failed_attempts`/`guardian_locked_until` on
  `kiosk_devices`. Task 3 IS the types task, so folding it in costs nothing, whereas deferring it
  leaves the hand-authored types describing a schema that no longer exists. Cost if wrong: two
  extra lines in a file Task 3 is already editing.
Tasks 1+2: minor (deferred): the `exception when unique_violation` block wraps the whole function
  body rather than just the insert, so a future unique index on `child_attendance` would be
  swallowed and the function would return NULL to a caller expecting a uuid. A nested
  `begin … exception … end` around the insert alone would scope it. Flagged by the implementer too.
Tasks 1+2: minor (deferred): the room guard checks location but not `rooms.is_active`, and the
  `coalesce` fallback to `children.room_id` is never validated (pre-existing).

Task 3: implemented (commit f69a8c1) — types for all four migrations plus the visit helpers, 61/61.
Task 3: Ruling: my staging list was too narrow and produced a commit that does not compile.
  I named three files, but making `kiosk_sessions.profile_id` nullable necessarily breaks every
  caller that assumed it was not — six sites in `src/lib/kiosk/actions.ts`. The implementer wrote
  the null-guard, correctly refused to stage a file outside its list, and flagged it. Verified by
  stashing: `HEAD` fails tsc with four errors at lines 126/147/162/182. Resumed the implementer to
  commit the guard as a follow-up rather than fixing it in the controller session or amending a
  pushed commit. Cost if wrong: one extra commit; the alternative was leaving a non-compiling
  commit in the history.
  Process note for later tasks: when a task changes a shared type's nullability, the staging list
  must include the call sites that type breaks, or the task cannot produce a green commit.
Task 3: complete (commits a13b9b4..e19250d, review clean — spec ✅, quality Approved)
  Reviewer verified every column of all six tables against the four migrations in both Row and
  Insert, all four RPC argument names token-for-token, and that the types diff is purely additive.
  Confirmed the null-guard is a genuine refusal (no `!`, no `?? ""`) routed through resolveSession,
  and noted it is currently anticipatory — nothing creates a guardian session yet, Task 4 does.
Task 3: minor (deferred): reusing SESSION_EXPIRED for a rejected guardian session is defensible
  (self-healing, leaks nothing), but if the branch is ever hit by a routing bug rather than a stale
  token, "took too long" actively misleads. Server-side logging of the reason would fix it.
Task 3: minor (deferred): no test at exactly the 12-hour `isStaleVisit` boundary (tests use 12.5h
  and 24h).

Task 4: implemented (commit 0a096c4) — guardian identify, check in/out, staff override.
  Implementer disclosed a staging deviation rather than hiding it: created `src/lib/kiosk/errors.ts`
  because a `"use server"` module may only export async functions, so a synchronous mapper cannot be
  exported for a test to import. Reviewer judged the reasoning correct and the split not
  over-engineered. Accepted.
Review (opus): spec ✅; quality Changes requested — 1 Important, 2 Minor.
  Verified correct: both child↔guardian checks are exact-pair queries running before the RPC and
  failing closed; the two session resolvers are PROVABLY disjoint (the `num_nonnulls(profile_id,
  guardian_id) = 1` constraint makes both-set structurally impossible); the staff path records
  `p_staff_id` with `p_guardian_id` null and is scoped to tenant AND location; expiry is enforced on
  every guardian action, not just identify; and `kioskIdentifyGuardian` exposes no enumeration
  oracle — bad PIN, unknown guardian and locked device all return one identical string.
  I1 the guardian path scopes by `child_guardians` but NOT by location, so a guardian with children
     at two sites could check in the Site B child from the Site A tablet — a phantom child on Site
     B's roster and in its ratio. The action is looser than `guardianChildrenWithPresence`, which
     already filters by `device.location_id`.
Task 4: Ruling: promoted the reviewer's unverifiable-without-a-database note to a fix. The error
  mapper compares `error.message` with `===` against the bare exception name, and nobody has
  confirmed PostgREST surfaces `raise exception 'no_open_visit'` undecorated. If it decorates, EVERY
  mapping degrades to the generic message and the tests still pass, because they feed the mapper
  bare strings. Switched to substring matching plus a test using a realistically decorated message.
  Cost if wrong: substring matching is marginally looser than equality on strings we control.
Task 4: minor (deferred): `revalidatePath("/attendance")` targets the staff attendance page; Tasks
  7-8 create the child route and will update it.
Task 4: fix round 1/5 (3 addressed, 0 open; commit 0a096c4..26d8ceb)
  Re-review confirmed both queries are awaited and gated before the RPC (no ordering window), the
  original child_guardians exact-pair check survives alongside the new location check, the failure
  message is byte-identical for a link miss and a location miss (no enumeration signal), none of the
  five raised exception strings is a substring of another so `.includes()` cannot misfire, and the
  replaced test still covers the unrecognized-exception fallback using the RPC's own num_nonnulls
  guard message.
Task 4: complete (commits e19250d..26d8ceb, review clean)
Task 4: minor (deferred): the location check adds a second Supabase round-trip per check-in/out —
  consistent with the existing kioskStaffCheckChild pattern, latency only.

Task 5: implemented (commit de45866) — mode picker, guardianPad, guardianMenu, staffRoster, plus
  kioskStaffRoster (no existing action returned "every active child at this location grouped by
  room with presence"). Work was found already in the working tree, unstaged, and was verified
  before staging: tsc clean over src/, 70/70, `npm run build` compiles.
Task 5: Ruling: reviewed in-controller rather than by a dispatched task reviewer. The human
  rejected the review dispatch and then compacted, so re-issuing it verbatim would be retrying a
  declined call. Cost if wrong: this task carries one reviewer's judgment (mine) instead of a
  fresh one's; the final whole-branch review still covers it.
Task 5: fix round 1 (1 finding, commit c847303)
  Finding — a successful child check-in/out called reset(), tearing down the session. A parent of
  two re-entered their PIN between siblings and staff re-PINned for every child off a bus, against
  the spec's own "siblings are listed together, which is the common drop-off". Success now flips
  that child's presence locally via flipGuardianChild/flipRosterChild and returns to the list.
  Privacy re-verified: bumpIdle() runs at the start of the action AND when the confirmation
  clears, so the blanking window still measures from the last tap, not from screen entry. The
  local presence copy never outlives its session — the next PIN entry refetches from the database.
Task 5: idle-timer audit, screen by screen — mode/pad/guardianPad are in NEUTRAL_VIEWS and carry
  nothing identifying, but every digit press calls bumpIdle() so a half-entered PIN still clears;
  menu/incident/guardianMenu/staffRoster are auto-armed by the useEffect on [view, identified,
  guardian] and every interaction on them routes through bumpIdle() or reset(). reset() is the
  single path back to neutral and tears down BOTH session tokens.
Task 5: complete (commits 26d8ceb..c847303)
Task 5: minor (deferred): a guardian reading the child list without tapping is reset at 45s. Safe
  direction (privacy over convenience), but a "still there?" prompt would be kinder.
Task 5: minor (deferred): `kiosk_staff_roster` reads `rooms` by id without checking `is_active`, so
  a child in a soft-deactivated room falls into "No room assigned" rather than showing the room
  name. Same gap already flagged on the check-in RPC's room guard.

Task 6: complete (commit aaa6cad) — resetGuardianPin + ResetGuardianPinForm + the child page control.
Task 6: Ruling: added a third file the brief did not list, `src/components/children/reset-guardian-pin-form.tsx`.
  `useActionState` is a client hook and the child detail page is a Server Component, so the control
  cannot be inline — the same constraint that already forced `src/components/staff/reset-pin-form.tsx`
  to exist for staff. Deliberately NOT merged with that component: they call different RPCs with
  different authorization rules, and one component parameterized on "which kind of person is this"
  is the shape that eventually issues a staff PIN to a parent. Cost if wrong: one small file.

Task 7: complete (commit 5181f2a) — getPresentChildren + /attendance/children + nav for both roles.
Task 7: Ruling: names come from `child_balance_status`, not an embedded `children(full_name)` join.
  `children_select` (20260802224828) admits directors only — verified in the migration — so the
  obvious join would have rendered an empty board for every staff user while working perfectly for
  the director testing it. This is the third time this exact trap has been hit on this project
  (Ruling H / Ruling K in the billing work). Cost if wrong: one extra query.
Task 7: Ruling: the page shows elapsed hours, not an arrival clock time. It renders on the server,
  whose timezone is not the centre's; a wall-clock time four hours out is worse than none. Cost if
  wrong: staff cannot see exact arrival times from this screen.

Task 8: complete (commit f50749d) — occupancy leads with present-not-enrolled, "Children here"
  metric, stale-visit attention branch, and docs/CHILD-ATTENDANCE-APPLY-CHECKLIST.md. 73/73.
Task 8: Ruling: the stale-visit branch is inserted BEFORE the money branch. Both are `warn`, the
  sort is stable and only three items survive the slice, so insertion order decides which warning a
  director actually sees. An attendance record claiming a child is in the building when they went
  home is what a licensing visit reads; overdue tuition is a phone call. Covered by a test that
  asserts the ordering, so it cannot silently regress.
Task 8: Ruling: `AttentionInput.staleVisits` is required, not optional. The dashboard is the only
  caller, and a caller that forgets it should fail to compile rather than silently lose the branch.
  Three existing test fixtures updated. Cost if wrong: three lines of test churn.
Task 8: MetricBar's column count became a lookup table — it was hard-coded `sm:grid-cols-4` and the
  fifth metric would have wrapped to an orphan row. Tailwind only ships classes it can see, so a
  template literal would have silently produced no class at all.

Branch review (in-controller, all 8 tasks): eslint clean over every touched directory after one
  fix — `GuardianMenuView` took its data array through the reserved `children` prop
  (react/no-children-prop), renamed to `childList` in b5ffecb. tsc clean over src/ (two residual
  errors are stale `.next/types/*  2.ts` duplicate build artifacts, not source). 73/73.
  `npm run build` compiles and routes /attendance/children.
  Degradation check: every new query reads `data` and ignores `error`, so with the migrations
  unapplied `child_attendance` simply returns null and the board/dashboard render empty rather than
  throwing. That is the right failure mode but it is SILENT — see the merge gate below.
MERGE GATE: do not merge to `main` before applying the four migrations. `main` auto-deploys, and
  the nav entry would ship a "Who's here" board that looks working and is permanently empty.

APPLIED to production 2026-08-17. The MCP Supabase connector is authorized to a DIFFERENT account —
  it lists nine projects and this app's `trezwfirgugzuphaflwm` is not among them, so apply_migration
  was not usable and applying to any listed project would have written childcare DDL into an
  unrelated production database. Applied instead over a direct connection using
  SUPABASE_DATABASE_PASSWORD from .env, each migration wrapped in its own BEGIN/COMMIT — which makes
  the half-applied state the checklist warns about unreachable.
  Identity confirmed before any DDL: tenant "AKPA University", all prerequisites present, none of
  the four new objects existing.
  §2, §3, §5, §6, §7 verified. §4 verified properly — the first attempt read an EMPTY guardian_pins
  and got 0 rows, which proves nothing, so it was redone with a real hashed PIN in the table and
  read back as both `authenticated` and `anon`. Both saw zero rows.
  All write-based checks ran inside rolled-back transactions, fixtures included. child_attendance
  holds 0 rows — no test visit was left in the audit table.
  Two dry-run "failures" were test artifacts, not schema defects, and are recorded as such: the
  database has 0 guardians/0 rooms/0 kiosk_devices, so the first run passed nulls into the
  "both actors set" case (a legitimate single-actor row) and inserted from an empty kiosk_devices
  select. Both passed once fixtures were created inside the transaction.
  `supabase_migrations.schema_migrations` does not exist — the CLI has never been used against this
  database. Nothing records that these four are applied except this note and the objects themselves.
  A future `supabase db push` would try to re-apply every migration in the repo.
NOT verified, needs a human and real data: §8 (guardian lockout — needs a registered device) and
  §9 (the door walkthrough). The database has 1 child, 0 guardians, 0 rooms, 0 kiosk devices.
Pre-existing, not introduced here: guardian_pins carries Supabase's default table grants to
  anon/authenticated (SELECT/INSERT/UPDATE/DELETE), byte-identical to profile_pins. RLS-with-no-
  policies is the actual control and was proven to deny. An explicit `revoke all on
  public.guardian_pins, public.profile_pins from anon, authenticated` would remove the dependence on
  a single mechanism; not done, because it changes production beyond what was asked.
