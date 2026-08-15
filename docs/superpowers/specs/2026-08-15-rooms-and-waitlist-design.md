# Rooms Foundation & Capacity-Aware Waitlist — Design Spec

**Status:** Approved for planning
**Date:** 2026-08-15
**Scope:** Link children to real rooms, give rooms capacity and an age range, and build a
capacity-aware waitlist on top. Establishes the foundation that ratio tracking (a separate,
later spec) will reuse.

## Context

`children.status` has carried a `waitlisted` value since the Money Module's Step 2 migration
(`20260802224828_children_and_guardians.sql:6`), but nothing in the app manages a waitlist —
the value only ever appears in a status dropdown and as a badge colour. A platform audit against
Procare, Brightwheel, HiMama, Kinderlime, EZCare, LifeCubby, CloudBB and iCare found waitlist
management to be a standard Tier-1 capability that AKPA lacks.

Two structural gaps block building it well:

1. **Children are not linked to rooms.** `children.classroom` is free text, while `rooms`
   (`20260813090000_kiosk_access.sql`) is a real table with `tenant_id`, `location_id`, `name`,
   and `is_active`. Nothing joins them.
2. **Rooms have no capacity.** There is no way to express that the Infant Room holds eight
   children, so "is a spot open?" cannot be answered.

Ratio tracking — the next planned feature — needs both of these too. `room_transfers` already
records which **staff** are in which room (written by the kiosk time clock), so once children
carry a `room_id` and rooms carry an age range, a staff:child ratio becomes computable. Building
the link once here is the reason this spec exists rather than a waitlist-only change.

## Goals

- Give rooms a capacity and an age range.
- Let a child be assigned to a real room.
- Provide a capacity-aware waitlist: who is waiting, for which room, how long, and whether a
  spot is open — with a one-click enroll that integrates with the billing engine already built.
- Do all of this **without modifying or destroying any existing child record data.**

## Non-goals

- **Ratio tracking.** Seat capacity is not a staffing ratio. A room can be under capacity and
  still out of ratio. That is a separate spec which will reuse `children.room_id` and the room
  age range defined here.
- **Dropping or auto-migrating `children.classroom`.** See "Migration safety" below.
- **Parent-facing waitlist signup.** No parent role exists; waitlist entries are created by a
  director, as child records already are.
- **Automatic promotion from the waitlist.** A spot opening does not auto-enroll anyone; a
  director decides.
- **Per-room billing rates.** Rates stay on the child, as the billing engine defines them.

## Migration safety — the governing constraint

`children.classroom` holds free text on live production records, and this project has **no
database access**: the Supabase project is unlinked, the MCP connection is authenticated to a
different account, and no migration from the billing engine has been applied yet. Nothing in
this spec may therefore depend on reading, matching, or transforming existing `classroom` values.

Accordingly:

- `children.classroom` is **retained unchanged**. It is not dropped, renamed, or parsed.
- `children.room_id` is **nullable**, with no backfill. Every existing child starts unassigned.
- Room assignment happens through the UI, one child at a time, by a director who can see the
  real values.
- The apply checklist ships a read-only reconciliation query listing distinct `classroom` values
  beside existing room names, so a director can plan the mapping before changing anything.

An auto-backfill that creates rooms from distinct `classroom` strings was explicitly rejected:
typos, abbreviations, and retired room names would each become a real room, and the result would
be written to live child records based on string matching nobody could verify first.

## Data model

### Extend `rooms`

| Column | Type | Notes |
|---|---|---|
| `capacity` | `integer null check (capacity is null or capacity > 0)` | Licensed seat count. Null = untracked, and the waitlist shows occupancy without an open/full verdict. |
| `min_age_months` | `integer null check (min_age_months is null or min_age_months >= 0)` | Lower bound of the room's age band. |
| `max_age_months` | `integer null check (max_age_months is null or max_age_months >= 0)` | Upper bound. |
| — | `check (min_age_months is null or max_age_months is null or min_age_months <= max_age_months)` | Ordering constraint. |

All nullable so the migration cannot fail against existing rows, and so a director can adopt
capacity per room at their own pace. Age bands exist for ratio tracking; this spec uses them only
to suggest a room when enrolling.

### Extend `children`

| Column | Type | Notes |
|---|---|---|
| `room_id` | `uuid null references public.rooms (id) on delete set null` | `on delete set null`, not cascade — deleting a room must never delete children. |
| `waitlisted_at` | `date null` | When the family joined the queue. Ordering key. Distinct from `created_at`, which is record-creation time. |
| `desired_start_date` | `date null` | When the family wants to start. Distinct from `start_date`, which is when enrollment actually began and which billing uses for proration. |

`classroom` is untouched.

### Indexes

- `children_room_id_idx on children (room_id)` — occupancy counts.
- `children_waitlist_idx on children (tenant_id, waitlisted_at) where status = 'waitlisted'` —
  partial, since the waitlist screen only ever reads waitlisted rows.

### RLS

No new policies. `children` keeps its director/platform_admin-only policies; `rooms` keeps
`rooms_select` (tenant-wide, so staff can already read room names) and `rooms_write`
(director/platform_admin). The staff-facing `child_balance_status` view is **not** extended with
room data in this spec — staff have no waitlist surface.

## Capacity and waitlist semantics

**Occupancy** for room R = count of children where `room_id = R` and `status = 'active'`.
Waitlisted and inactive children never consume a seat.

**Open spots** = `capacity - occupancy`, when `capacity` is set. Null capacity yields "—" rather
than a misleading zero.

**Waitlist ordering** is by `waitlisted_at` ascending, then `created_at` ascending as a stable
tiebreaker for two families added the same day. Ordering is by date only — no manual priority
field, no sibling-priority rule. Those are real policies AKPA may want, but inventing them
without the director's input would be guessing; the "Non-goals" of a later revision can revisit it.

**Waiting time** is displayed as days since `waitlisted_at`, computed with `todayISO()` from
`@/lib/billing/dates` so it matches the Eastern-timezone convention the billing engine already
established. Using UTC here would show a day's difference after ~7pm local.

**Enrolling** a waitlisted child sets `status = 'active'`, sets `start_date`, clears
`waitlisted_at`, and assigns `room_id` if not already set. `desired_start_date` is **retained**,
not cleared — it records what the family originally asked for, which stays useful beside the
actual `start_date` when a center enrolls earlier or later than requested. Because the billing engine is live,
the child begins generating tuition charges on the next generation run for the period containing
`start_date`, prorated by the existing rules. This is stated explicitly on the enroll control so
a director understands that enrolling starts billing.

## Portal surface

Nav gains **Waitlist** under the existing `Children` section (director/platform_admin only),
beside "Children & guardians".

| Route | Purpose |
|---|---|
| `/waitlist` | Grouped by room: occupancy (`6/10`), an open-spot or full indicator, and the ordered list of waiting children with days waiting and desired start date. Children with no room assignment group under "Unassigned". Each row has an **Enroll** control. |

**Existing pages updated:**

- `/children/[childId]` — room assignment select (populated from active rooms at the child's
  location), `waitlisted_at`, and `desired_start_date` fields. The legacy `classroom` text field
  remains visible beside the room select, labelled as legacy, until a director has migrated
  everyone.
- `/children` — a status filter (All / Active / Waitlisted / Inactive), since waitlisted children
  currently sit mixed into the main roster with no way to separate them.
- `/settings` — capacity and age-range fields on the existing room management UI.

## Error handling and edge cases

- **Enrolling into a full room** is permitted but warns, showing occupancy against capacity. Real
  centers exceed seat counts temporarily; a hard block would be wrong, and licensing capacity is
  a compliance question that ratio tracking will handle properly.
- **A child waitlisted with no room** is valid and groups under "Unassigned" — a family often
  joins a waitlist before a room is decided.
- **Deleting a room** sets `children.room_id` to null rather than cascading. Children survive.
- **Enrolling without a `start_date`** is rejected with a message, because billing proration
  depends on it.
- **`capacity` null** renders occupancy without an open/full verdict rather than implying zero.
- **A child already `active`** does not appear on the waitlist regardless of `waitlisted_at`.

## Testing approach

- Vitest for the pure logic: occupancy/open-spot arithmetic including the null-capacity case, and
  the days-waiting calculation across a timezone boundary (the bug class the billing engine hit).
- The apply checklist covers what unit tests cannot without a database: that the partial waitlist
  index is used, that `on delete set null` preserves children when a room is deleted, that RLS
  still blocks staff from `children`, and the `classroom`-to-room reconciliation query.
- Following the billing engine's precedent, no SQL is applied by this project. The migration is
  delivered for the director to apply, with checklist verification.

## Future work (not this spec)

- Ratio tracking, reusing `children.room_id`, the room age band, and `room_transfers` for staff
  presence.
- Manual waitlist priority and sibling-first rules, if AKPA wants them.
- Retiring `children.classroom` once every child carries a `room_id`.
- Parent-facing waitlist signup, which depends on the deferred parent portal.
