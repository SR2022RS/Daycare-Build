# Child Check-In / Check-Out & Pickup Authorization — Design Spec

**Status:** Approved for planning
**Date:** 2026-08-16
**Scope:** Record which children are physically present, who dropped them off and who collected
them, and enforce pickup authorization at the door. Establishes the presence data that ratio
tracking requires.

## Context

Ratio tracking was the intended next feature. Exploration found it cannot be built honestly: the
system has **no concept of child presence at all**. There is no child attendance table, no
check-in flow, and no pickup record — a grep for `child_attendance|check_in|dropoff|pickup` finds
only a form template and a "Late Pickup Fee" seed row. What the database holds is *enrollment*
(`children.room_id`, `children.status`), not attendance.

A staff:child ratio is a claim about who is in a room right now. Computed from the roster it would
count a child who is home sick and a half-day child all afternoon. A compliance tool that reports a
confident wrong number is worse than no tool, because people act on it. Child presence therefore
comes first, and ratio tracking follows as a small piece on top.

This is also a Tier-1 capability in its own right. Every product in the platform audit — Brightwheel,
CloudBB, Procare, Kinderlime, HiMama — leads with digital check-in, and iCare's material calls out
authenticated attendance records as what licensing and subsidy audits actually ask for. AKPA has
none today.

Two secondary findings shaped the design:

- **Pickup data already exists but is unusable.** The `pickup_authorization` form collects authorized
  people, a **code word**, and a **"not authorized to pick up"** list — stored as JSONB in
  `child_form_submissions.data` with flat `person1Name` / `person2Name` keys and `notAuthorized` as
  free text. Nothing can query it, so it cannot be enforced.
- **Staff room presence is unreliable.** Room selection at the kiosk is an optional dropdown nobody
  is prompted to use, and clock-out never clears it, so a staffer's last room persists overnight.
  That is out of scope here and belongs to the ratio spec, but it is the other half of the same gap.

## Goals

- Record child arrivals and departures with an authenticated actor and a timestamp.
- Let a guardian check their own children in and out with a PIN at the existing kiosk.
- Let staff act when a guardian cannot — recording that it was staff-initiated.
- Turn pickup authorization into queryable data and enforce it at the door.
- Produce attendance records suitable for a licensing or subsidy audit.

## Non-goals

- **Ratio tracking.** The next spec, which consumes this one's output.
- **Reliable staff→room presence.** Belongs with ratio tracking.
- **Late-pickup fee automation.** Billing already reserves the concept; checkout time is the natural
  trigger, but wiring it is deferred.
- **Parent portal access.** No parent login. A guardian PIN is kiosk-only, exactly as the staff PIN
  is — this preserves the established rule that a PIN never grants portal access.
- **Photo capture or signature pads.** Not required by the flows above.

## Data model

### `guardian_pins`

Mirrors `profile_pins` (`20260804090000_pin_login.sql`) precisely: hashed PIN, per guardian, with the
same lockout counters and the same attempt-audit table shape the staff kiosk already uses. That
architecture has already been through a security review; reusing it avoids inventing a second
credential scheme.

Directors issue and reset PINs from the child detail page, beside the existing guardian list.

### `child_attendance`

One row per **visit**, not per day:

| Column | Notes |
|---|---|
| `id`, `tenant_id`, `location_id` | Standard scoping. |
| `child_id` | References `children`. |
| `room_id` | Nullable. Defaults from `children.room_id`; staff may place a child elsewhere for the day so the ratio reflects reality. |
| `checked_in_at` | `timestamptz not null`. |
| `checked_out_at` | `timestamptz null` — null means **currently present**. |
| `in_by_guardian_id` / `in_by_staff_id` | Exactly one is set, enforced by a check constraint (`num_nonnulls(...) = 1`). Which one records whether the guardian authenticated or staff vouched. |
| `out_by_guardian_id` / `out_by_staff_id` | Same, on departure, enforced as `num_nonnulls(...) = 1` whenever `checked_out_at` is set and `0` while it is null. |
| `out_override_reason` | Set when staff released a child to someone not on the authorized list. |
| `created_at` | |

A row per visit rather than per day is the one deliberate deviation from the staff `attendance`
table's shape (which is one row per `staff_id, date`). Children leave for appointments and return;
a single daily in/out cannot express that, and a child who left at 11am must stop counting toward a
ratio. "Who is present" is `checked_out_at is null` — which is precisely the ratio numerator.

Indexes: `(tenant_id, room_id)` filtered on `checked_out_at is null` for the live view, and
`(child_id, checked_in_at desc)` for a child's history.

### `child_pickup_authorizations`

Turns the form's JSONB into enforceable rows.

| Column | Notes |
|---|---|
| `id`, `tenant_id`, `child_id` | |
| `name` | The person. |
| `relationship`, `phone` | Nullable, from the form. |
| `kind` | Enum `authorized` \| `denied`. |
| `source` | Enum `form` \| `manual` — whether it was parsed from a submission or entered by a director. |
| `note` | Free text, used for the circumstances behind a `denied` entry. |

`children` gains `pickup_code_word text` — the fallback when someone unexpected arrives and staff
verify by phone.

Populated two ways: a director manages the list on the child's page, and submitted
`pickup_authorization` forms are parsed into rows on arrival so existing paperwork is not stranded.
Parsing reads `person1Name`/`person1Relation`/`person1Phone` (and 2, 3…) into `authorized` rows, and
the free-text `notAuthorized` field into a single `denied` row carrying the original text in `note` —
free text cannot be split reliably, and a human must review it rather than the parser guessing.

### RLS

All three tables follow the established pattern: `to authenticated`, tenant-scoped, with writes
restricted to `director`/`platform_admin`. Kiosk writes go through `security definer` RPCs using the
service role, exactly as `kiosk_identify_pin` and `admin_set_staff_pin` already do — the kiosk is
unauthenticated and must never hold a general write policy.

## The three-tier pickup rule

The critical design decision. A uniform warn-and-override would be wrong, because the
not-authorized list exists for custody orders and safeguarding.

1. **A linked guardian** (`child_guardians`) or an `authorized` row → proceeds normally.
2. **Not on any list** → warns clearly, requires a **staff PIN** to confirm, records who approved it
   and why in `out_override_reason`. This is the grandmother-in-an-emergency case; blocking it would
   be worse than recording it, and the record is what protects the centre.
3. **Named on a `denied` row** → **blocked at the kiosk with no override.** A prominent alert tells
   staff to fetch a director. Correcting a wrong entry requires changing the record in the portal —
   deliberately slower, because the cost of being wrong runs in one direction.

Name matching for tiers 2 and 3 is case-insensitive and whitespace-normalised, and a `denied` match
is checked **before** an `authorized` match so the stricter rule always wins.

## Kiosk flows

The tablet gains a mode switch. Today it is staff-PIN-only; it becomes *"I'm staff"* /
*"I'm dropping off or picking up"*.

**Guardian path:** PIN → their own children only → tap to check in or out. On checkout the tier rules
above apply. A guardian checking out their own child is tier 1 by definition.

**Staff path:** a staff member authenticates with their existing PIN, opens a room roster, and marks
children in or out — for the forgotten tap, the bus arrival, the busy morning. Every staff-initiated
action sets `in_by_staff_id`/`out_by_staff_id`, so an audit can distinguish "the guardian
authenticated" from "we vouched for it".

Both paths write through a `security definer` RPC that performs the authorization check server-side.
The client never decides whether a pickup is allowed.

## Portal surfaces

| Route | Purpose |
|---|---|
| `/attendance/children` | "Who's here" — today's presence grouped by room, live. Director and staff. |
| `/children/[childId]` | Attendance history, pickup-authorization management, the code word, and guardian PIN issue/reset beside each guardian. Director only. |

Guardian PINs are deliberately **not** in `/settings`: they belong to a child's family, not to the
centre's configuration, and a director issuing one is already looking at that child's record.

The dashboard's occupancy panel switches from roster counts to real presence, and gains a
children-present metric.

## Error handling and edge cases

- **Never checked out.** At end of day an open visit is *flagged*, not auto-closed — mirroring the
  existing "shift needs correcting" signal. Silently inventing a departure time would corrupt the
  very record an audit relies on.
- **Double check-in.** Idempotent: if an open visit exists for that child, checking in again returns
  the existing visit rather than creating a second.
- **Check-out with no open visit.** Rejected with a clear message; staff can record a corrected
  visit from the portal.
- **Child with no `room_id`.** Permitted — the visit records a null room and the child appears under
  "Unassigned" in the live view, matching how the waitlist already handles unassigned children.
- **Guardian PIN reuse across children.** One PIN per guardian; siblings are listed together, which
  is the common drop-off.
- **Locked-out guardian.** Same lockout semantics as the staff PIN, and staff can always complete
  the action on their behalf via the staff path.
- **Inactive or waitlisted child.** Not checkable-in; the kiosk says why.

## Testing approach

- Vitest for the pure logic: the three-tier authorization decision (a `denied` match beating an
  `authorized` one, case and whitespace normalisation), visit idempotency rules, and the form-JSON
  parser, which must handle missing `personN` keys and an empty `notAuthorized` field without
  inventing rows.
- The apply checklist covers what unit tests cannot without a database: RLS isolation on all three
  tables, that the kiosk RPCs work unauthenticated while direct table writes are refused, and a full
  door walkthrough — guardian check-in, staff override, and a blocked `denied` attempt.
- Following the established precedent, no SQL is applied by this project. Migrations are delivered
  for the director to apply, with checklist verification.

## Future work (not this spec)

- Ratio tracking, consuming `child_attendance` for the numerator and reliable staff→room presence for
  the denominator.
- Making staff room assignment mandatory at clock-in and clearing it on clock-out and breaks.
- Late-pickup fees triggered from `checked_out_at`.
- Parent-facing attendance history, which depends on the deferred parent portal.
