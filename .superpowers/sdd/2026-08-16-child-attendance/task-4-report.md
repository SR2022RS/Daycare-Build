# Task 4 Report: Kiosk server actions

## Files changed

- `src/lib/kiosk/actions.ts` — modified (staged for commit)
- `src/lib/kiosk/definitions.ts` — modified (staged for commit)
- `src/lib/kiosk/errors.ts` — **new, not on the instructed staging list** (staged anyway; see "Deviation" below)
- `src/lib/kiosk/errors.test.ts` — new test file (staged, per "plus any test file you add")

No migration was written — `20260817120200_kiosk_guardian_sessions.sql` and `20260817120300_guardian_lockout.sql` already exist from Task 1/the controller ruling, and were only read, not modified.

## Functions added

`src/lib/kiosk/definitions.ts`:
- `GuardianIdentity` — discriminated union, same shape as `KioskIdentifyResult`: `{ ok: true; sessionToken; guardianName; children: { id, fullName, roomName, present }[] } | { ok: false; message }`.

`src/lib/kiosk/actions.ts`:
- `resolveGuardianSession(sessionToken)` — private, mirrors `resolveSession`: returns `null` unless the row's `guardian_id` is set (and not expired), so a staff session (`profile_id` set, `guardian_id` null) can never satisfy it. Kept as a fully separate function from `resolveSession`, not a shared helper with a flag, so the two can't accidentally converge.
- `guardianChildrenWithPresence(admin, guardianId, locationId)` — private helper. Looks up the guardian's linked children via `child_guardians`, filters to children active at the kiosk's own `location_id`, then joins room names and open `child_attendance` rows to compute `present`.
- `kioskIdentifyGuardian(deviceToken, pin)` — exported. Same shape as `kioskIdentify`: regex-gates the PIN, looks up the device by `device_token`, calls `kiosk_identify_guardian_pin`, mints a `kiosk_sessions` row with `guardian_id` set / `profile_id` left null, returns the session token plus the guardian's children (via the helper above).
- `kioskCheckChildIn(sessionToken, childId)` — exported. Resolves a **guardian** session, re-verifies the child belongs to that guardian, calls `kiosk_check_child_in` with `p_guardian_id` set / `p_staff_id` null.
- `kioskCheckChildOut(sessionToken, childId)` — exported. Same pattern for `kiosk_check_child_out`.
- `kioskStaffCheckChild(sessionToken, childId, direction)` — exported. Resolves a **staff** session via the existing `resolveSession` (which already refuses guardian sessions per Task 3), re-verifies the child belongs to the session's own tenant *and* location, then calls the same two RPCs with `p_staff_id` set / `p_guardian_id` null.
- `mapChildAttendanceError(message)` — private, thin wrapper around the pure function in `errors.ts`, supplying `GENERIC_KIOSK_ERROR` as the fallback.

`src/lib/kiosk/errors.ts` (new):
- `mapChildAttendanceError(message, genericMessage)` — pure function, the actual exception→message mapping. Pulled out of `actions.ts` because a `"use server"` module may only export async functions, and this logic needed a unit test.

## Where the two independent guardian↔child checks happen

Both `kioskCheckChildIn` and `kioskCheckChildOut`:

1. **Action-side (check #1):** before calling any RPC, query `child_guardians` directly for a row matching `(child_id = childId, guardian_id = session.guardian_id)`. No match → return `"That child isn't linked to your account."` without ever calling the RPC.
2. **RPC-side (check #2):** `kiosk_check_child_in`/`_out` independently re-run the identical `child_guardians` existence check inside the `SECURITY DEFINER` function and raise `guardian_not_linked` if it fails.

These two checks query the same table but are structurally independent — the RPC's check isn't "trust the action already did this," it re-derives the answer itself. A bug or a race in one (e.g. the link is removed between the action's query and the RPC call) is still caught by the other.

For `kioskStaffCheckChild`, there's no `child_guardians`-equivalent link to check (staff can vouch for any child at their location), so the corresponding defense-in-depth is: the action re-resolves `childId` against `children` scoped to `session.tenant_id` **and** `session.location_id` before calling the RPC, and the RPC independently re-checks that `p_staff_id` belongs to the child's own tenant (`staff_not_in_tenant`).

## RPC exception → screen message mapping (`mapChildAttendanceError`)

| RPC exception | Kiosk message | Reasoning |
|---|---|---|
| `no_open_visit` (checkout only) | "This child isn't checked in." | The one checkout-side error a person at the door can act on: it means the child already left, not a system failure. |
| `guardian_not_linked` | "That child isn't linked to your account." | Actionable for a guardian (though the action-side pre-check should already have caught this — see above; this branch exists for the race/defense-in-depth case). |
| `staff_not_in_tenant` | `GENERIC_KIOSK_ERROR` | Not something a person at the kiosk can fix; indicates a system inconsistency, and the action's own pre-check should already prevent it from firing. |
| `room_not_at_location` | `GENERIC_KIOSK_ERROR` | Never actually reachable from these four functions — none of them pass `p_room_id` (guardians have no room picker; `kioskStaffCheckChild`'s signature has no room param either) — but mapped defensively rather than left to fall through unhandled. |
| `child not active` / anything else unrecognized | `GENERIC_KIOSK_ERROR` | Default fallback — no raw exception name is ever passed to the UI. |

`mapChildAttendanceError` is called whenever `error` is set **or** `visitId` is falsy, so a null/undefined RPC result without an `error` object also degrades to the generic message rather than silently reporting success.

## Verification output

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
 Test Files  8 passed (8)
      Tests  67 passed (67)

$ npx eslint src/lib/kiosk/actions.ts src/lib/kiosk/definitions.ts src/lib/kiosk/errors.ts src/lib/kiosk/errors.test.ts
(clean, no output)
```

(61 pre-existing + 6 new in `errors.test.ts` = 67.)

## What could not be verified without a database

Every RPC-calling path — `kioskIdentifyGuardian`'s call to `kiosk_identify_guardian_pin`, and all four `kiosk_check_child_in`/`kiosk_check_child_out` call sites across `kioskCheckChildIn`, `kioskCheckChildOut`, and `kioskStaffCheckChild` — cannot be exercised without a live Postgres instance running the actual `plpgsql` functions (lockout counters, `for update` locking, the `unique_violation` retry path in `kiosk_check_child_in`, the exact exception message text raised by `raise exception '...'`). Per instructions, no `supabase` commands were run and the database was not touched. These paths were checked by:
- Reading the migration SQL directly and matching every `p_*` argument name/order/nullability against `database.types.ts`'s `Functions` block (already correct — see Task 3's report).
- Manual trace of each action against the RPC source to confirm which exceptions each call site can actually raise (e.g. confirming `room_not_at_location` is unreachable given no caller ever passes a non-null `p_room_id`).

The one thing that *was* pulled out and unit-tested is the pure post-RPC error-mapping logic (`errors.ts` / `errors.test.ts`), since that doesn't require a database.

## Deviation from the instructed staging list

The brief says to stage only `src/lib/kiosk/actions.ts` and `src/lib/kiosk/definitions.ts` "plus any test file you add." I also added `src/lib/kiosk/errors.ts`, a new **non-test** source file, and staged it.

Reasoning: the task requires unit tests for any pure logic introduced. The one piece of pure logic here is the RPC-exception-to-message mapping. But `actions.ts` starts with `"use server"`, and Next.js requires every export of a `"use server"` module to be an async function — a synchronous `mapChildAttendanceError` cannot be exported from that file for a test to import. Keeping it as a private, non-exported function in `actions.ts` would satisfy the framework but leave it untestable, contradicting the verification requirement. Extracting it to a plain module was the only way to satisfy both constraints simultaneously. `actions.ts` still has a private wrapper of the same name that just supplies `GENERIC_KIOSK_ERROR`, so nothing about the call sites in `actions.ts` changed shape.

Flagging this explicitly rather than silently widening the staging list, per instruction.

## Fix round 1

Spec review came back green and confirmed the core design (disjoint session resolvers via `num_nonnulls`, the two independent guardian↔child checks, staff path scoped to tenant+location recording "staff vouched", expiry enforced everywhere, no PIN-enumeration oracle, `errors.ts` split judged correct). Three findings addressed, one deferred as instructed.

**🟠 IMPORTANT 1 — guardian actions didn't scope the child to the session's location.** `kioskCheckChildIn` and `kioskCheckChildOut` verified only the `child_guardians` link, not that the child is actually active *at this kiosk's location*. A guardian with children at two sites in one tenant could stand at the Site A tablet and POST a Site B child's id: the link check passed, the RPC's `guardian_not_linked` check passed (the RPC has no notion of which kiosk called it), and the visit would write with the child's own `location_id` — a phantom present-child at Site B, landing directly in that site's ratio numerator. `guardianChildrenWithPresence` already filtered the *rendered list* by `device.location_id`; the write path was looser than the list.

Fix: both actions now run the `child_guardians` link query and a `children` query (`id = childId AND location_id = session.location_id AND status = 'active'`) in parallel via `Promise.all`, and fail closed — either query missing a row returns the *same* message, `"That child isn't linked to your account."` Deliberately not a distinct "wrong location" message: a different string would let a caller distinguish "not your child" from "your child, wrong site," which discloses which children exist at which location. This brings the guardian path to the same shape as `kioskStaffCheckChild`, which already scoped to tenant+location.

**🟡 MINOR 2 — `child not active` misdirected a parent to the director.** `errors.ts` previously let this RPC exception (reachable in normal use — a withdrawn child, a stale cached roster on the tablet) fall through to `GENERIC_KIOSK_ERROR`, `"This kiosk isn't set up. Contact your director."` — an enrollment fact reported as a system failure, sent to the wrong person. Now maps to `"That child isn't enrolled here right now."` Added a unit test asserting this specific mapping (previously the test suite asserted the *opposite* — that this string fell back to generic — so that test was replaced, not just supplemented).

**CONTROLLER ADDITION 3 — exact-match error matching couldn't survive PostgREST decorating the message.** `mapChildAttendanceError` compared `error.message` with `===` against the bare exception name (`"no_open_visit"`, `"guardian_not_linked"`). Nobody has confirmed PostgREST returns `raise exception 'no_open_visit'` as exactly that string rather than some wrapped/prefixed form, and this path is unverifiable without a live database (still true — no `supabase` commands were run). If the real shape is decorated, every mapping would silently degrade to the generic message, and the pre-existing tests — which fed the mapper bare strings — would never catch it.

Fix: switched all three comparisons to `message.includes(...)`, and added `if (!message) return genericMessage;` up front (an `includes` call on `undefined` would throw). Added two new tests feeding a realistically decorated message — `'unexpected response: {"code":"P0001","message":"no_open_visit"}'` and the `guardian_not_linked` equivalent — asserting both still map correctly. Kept the bare-string tests for the same two exceptions plus the `child not active`, `staff_not_in_tenant`, `room_not_at_location`, and no-message cases; the "unrecognized exception" test's fixture string changed from `"child not active"` (no longer unrecognized, see Minor 2) to `"exactly one of guardian or staff must check the child in"` (the RPCs' `num_nonnulls` guard-clause message, still expected to fall back to generic).

**Deferred, not touched:** the four `revalidatePath("/attendance")` calls — confirmed harmless today (no child-attendance route exists yet) and left for Tasks 7-8 to update when that route is built, per the controller's explicit instruction not to fix this now.

### Verification output (fix round 1)

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
 Test Files  8 passed (8)
      Tests  70 passed (70)

$ npx eslint src/lib/kiosk/actions.ts src/lib/kiosk/definitions.ts src/lib/kiosk/errors.ts src/lib/kiosk/errors.test.ts
(clean, no output)
```

(67 from the initial pass + 3 new in `errors.test.ts` — one `child not active`-specific case and two decorated-message cases — = 70. No files changed outside `src/lib/kiosk/actions.ts`, `src/lib/kiosk/errors.ts`, and `src/lib/kiosk/errors.test.ts`; `definitions.ts` was untouched this round.)
