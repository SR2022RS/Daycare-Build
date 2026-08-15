# Rooms Foundation & Capacity-Aware Waitlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link children to real rooms with capacity and an age band, and build a capacity-aware waitlist on top of it.

**Architecture:** Purely additive schema — `rooms` gains capacity/age columns, `children` gains a nullable `room_id` plus two waitlist dates, and `children.classroom` is retained untouched with no backfill. A new `/waitlist` route groups waiting families by room and shows occupancy against capacity. Occupancy and waiting-time arithmetic live in a pure, unit-tested module; everything else is Server Components reading Supabase directly, matching the existing app.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (Postgres + RLS), TypeScript, Tailwind (hand-written, no component library), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-rooms-and-waitlist-design.md`

## ⚠️ Precondition before Task 1

This plan modifies `src/lib/kiosk/actions.ts` (Task 3) and `src/app/(app)/settings/page.tsx` (Task 3), **both of which currently hold the user's uncommitted work** (kiosk time clock, support tickets, PIN login, intensive registrations). The user has agreed to commit that work first.

**Do not begin Task 3 until `git status` shows those two files clean.** If they are still dirty, stop and report rather than committing the user's work under a rooms/waitlist message — that has already happened three times on this branch and produces misleading history.

## Global Constraints

- **Never `git add -A`, `git add .`, or `git commit -a`.** Stage only the exact files a task names. Read `git diff --cached` in full before committing.
- **No database or `supabase` commands.** The Supabase project is unlinked and the database is live production. Migrations are delivered as files for the director to apply; no task applies or verifies SQL against a database.
- **`children.classroom` is never dropped, renamed, parsed, or backfilled from.** It is retained as a legacy display field.
- **`children.room_id` is nullable with no backfill.** Every existing child starts unassigned.
- Migration filenames: `YYYYMMDDHHMMSS_description.sql`, timestamped `>= 20260815`, applied in timestamp order, none re-runnable.
- Revokes on Supabase must name each grantee: `from public, anon` (plus `authenticated, service_role` for internal objects). `revoke ... from public` alone is insufficient — see `supabase/migrations/20260804090000_pin_login.sql:52-55`.
- RLS convention: `to authenticated`, `using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))` with a matching `with check` on writes; policies named `"<table>_select"` / `"<table>_write"`.
- **No UI component library.** `src/components/ui/` contains only `stat-tile.tsx`. Hand-write Tailwind matching the existing app.
- Any "today" value comes from `todayISO()` in `@/lib/billing/dates` (America/New_York), never `new Date().toISOString().slice(0,10)`.
- Server Actions: `"use server"` is the first line of the file; every action re-verifies with `requireRole(["director", "platform_admin"])` from `@/lib/auth/dal`; validation is manual `typeof`/trim checks, not zod.
- RLS-blocked writes return zero rows rather than an error — actions needing user-facing failure chain `.select("id").maybeSingle()` and distinguish `error` / `!data` / success.
- `src/types/database.types.ts` is hand-authored and shared with the user's unrelated work: additive changes only, never reformat or reorder.
- `npx tsc --noEmit` must be clean and `npm test` must pass before every commit.

---

### Task 1: Occupancy and waiting-time math

Pure functions with no I/O, unit-tested. Everything else in this plan reads from these.

**Files:**
- Create: `src/lib/rooms/occupancy.ts`
- Create: `src/lib/rooms/occupancy.test.ts`

**Interfaces:**
- Consumes: `todayISO()` from `@/lib/billing/dates`
- Produces:
  - `export interface RoomOccupancy { capacity: number | null; enrolled: number; openSpots: number | null; isFull: boolean; }`
  - `export function occupancyFor(capacity: number | null, enrolled: number): RoomOccupancy`
  - `export function daysWaiting(waitlistedAt: string | null, today?: string): number | null`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { daysWaiting, occupancyFor } from "./occupancy";

describe("occupancyFor", () => {
  it("reports open spots when under capacity", () => {
    expect(occupancyFor(10, 6)).toEqual({
      capacity: 10,
      enrolled: 6,
      openSpots: 4,
      isFull: false,
    });
  });

  it("reports full at exactly capacity", () => {
    expect(occupancyFor(8, 8)).toEqual({
      capacity: 8,
      enrolled: 8,
      openSpots: 0,
      isFull: true,
    });
  });

  it("never reports negative open spots when over capacity", () => {
    expect(occupancyFor(8, 9)).toEqual({
      capacity: 8,
      enrolled: 9,
      openSpots: 0,
      isFull: true,
    });
  });

  it("leaves openSpots null and isFull false when capacity is untracked", () => {
    expect(occupancyFor(null, 6)).toEqual({
      capacity: null,
      enrolled: 6,
      openSpots: null,
      isFull: false,
    });
  });
});

describe("daysWaiting", () => {
  it("returns whole days between the waitlist date and today", () => {
    expect(daysWaiting("2026-08-03", "2026-08-15")).toBe(12);
  });

  it("returns 0 on the day the family joined", () => {
    expect(daysWaiting("2026-08-15", "2026-08-15")).toBe(0);
  });

  it("returns null when there is no waitlist date", () => {
    expect(daysWaiting(null, "2026-08-15")).toBeNull();
  });

  it("does not go negative for a future-dated waitlist entry", () => {
    expect(daysWaiting("2026-08-20", "2026-08-15")).toBe(0);
  });

  it("counts across a month boundary", () => {
    expect(daysWaiting("2026-07-30", "2026-08-02")).toBe(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/rooms/occupancy.test.ts`
Expected: FAIL — cannot find module `./occupancy`.

- [ ] **Step 3: Write the implementation**

```ts
import { todayISO } from "@/lib/billing/dates";

/**
 * Seat occupancy for one room. This is capacity, NOT a staffing ratio -- a
 * room can sit under capacity and still be out of ratio. Ratio tracking is a
 * separate feature; nothing here should be read as a compliance signal.
 */
export interface RoomOccupancy {
  capacity: number | null;
  enrolled: number;
  openSpots: number | null;
  isFull: boolean;
}

/**
 * `capacity` is null when a director has not set one. That is reported as
 * "untracked" (null openSpots, never full) rather than zero, so an unset
 * capacity cannot masquerade as a full room and block enrollment decisions.
 */
export function occupancyFor(capacity: number | null, enrolled: number): RoomOccupancy {
  if (capacity === null) {
    return { capacity: null, enrolled, openSpots: null, isFull: false };
  }

  return {
    capacity,
    enrolled,
    // Real centers do exceed a seat count temporarily, so clamp at zero
    // rather than reporting negative spots.
    openSpots: Math.max(capacity - enrolled, 0),
    isFull: enrolled >= capacity,
  };
}

/**
 * Whole days a family has been waiting. Both dates are YYYY-MM-DD strings
 * parsed as UTC midnight, so the subtraction is exact -- but "today" comes
 * from todayISO(), which resolves in the center's timezone. Using
 * `new Date()` here would add a day after ~7pm local.
 */
export function daysWaiting(waitlistedAt: string | null, today: string = todayISO()): number | null {
  if (!waitlistedAt) return null;

  const from = Date.parse(`${waitlistedAt}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;

  const days = Math.round((to - from) / 86_400_000);
  // A future-dated entry is a data-entry slip, not negative waiting time.
  return Math.max(days, 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/rooms/occupancy.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all prior tests still pass (18 before this task, 27 after); tsc silent.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rooms/occupancy.ts src/lib/rooms/occupancy.test.ts
git commit -m "Add room occupancy and waiting-time math

Capacity is seats, not a staffing ratio -- null capacity reports as
untracked rather than zero so an unset capacity cannot look like a full
room. Waiting time resolves today in the center's timezone via todayISO."
```

---

### Task 2: Schema migration

**Files:**
- Create: `supabase/migrations/20260815120000_rooms_capacity_and_waitlist.sql`

**Interfaces:**
- Produces: `rooms.capacity`, `rooms.min_age_months`, `rooms.max_age_months`; `children.room_id`, `children.waitlisted_at`, `children.desired_start_date`; indexes `children_room_id_idx`, `children_waitlist_idx`.

- [ ] **Step 1: Read the tables being altered**

Read `supabase/migrations/20260813090000_kiosk_access.sql` (the `rooms` table and its RLS) and `supabase/migrations/20260802224828_children_and_guardians.sql` (the `children` table). Match their comment style and formatting.

- [ ] **Step 2: Write the migration**

```sql
-- Rooms foundation for the capacity-aware waitlist, and the shared base that
-- ratio tracking will reuse (children.room_id + the room age band, joined
-- against room_transfers for staff presence).
--
-- Deliberately additive. children.classroom is free text on live records and
-- this project has no database access to inspect it, so nothing here reads,
-- matches, or migrates those values: room_id is nullable with no backfill and
-- classroom is retained untouched. Directors assign rooms through the UI.

-- ── rooms: capacity + age band ───────────────────────────────────────────
-- All nullable so this cannot fail against existing rows, and so capacity can
-- be adopted per room at the director's pace. The age band is unused by the
-- waitlist beyond suggesting a room; it exists because ratio tracking needs
-- it and a second migration for one column would be waste.
alter table public.rooms
  add column capacity integer,
  add column min_age_months integer,
  add column max_age_months integer;

alter table public.rooms
  add constraint rooms_capacity_positive
    check (capacity is null or capacity > 0),
  add constraint rooms_min_age_non_negative
    check (min_age_months is null or min_age_months >= 0),
  add constraint rooms_max_age_non_negative
    check (max_age_months is null or max_age_months >= 0),
  add constraint rooms_age_band_ordered
    check (
      min_age_months is null
      or max_age_months is null
      or min_age_months <= max_age_months
    );

-- ── children: room assignment + waitlist dates ───────────────────────────
-- on delete set null, never cascade: deleting a room must not delete children.
alter table public.children
  add column room_id uuid references public.rooms (id) on delete set null,
  add column waitlisted_at date,
  add column desired_start_date date;

comment on column public.children.classroom is
  'Legacy free-text room name. Superseded by room_id; retained until every child is assigned and never auto-migrated.';
comment on column public.children.waitlisted_at is
  'When the family joined the waitlist queue. Ordering key for /waitlist. Distinct from created_at (record creation).';
comment on column public.children.desired_start_date is
  'When the family asked to start. Distinct from start_date (when enrollment actually began, which billing prorates from). Retained after enrollment.';

create index children_room_id_idx on public.children (room_id);

-- Partial: the waitlist screen only ever reads waitlisted rows, and enrolling
-- flips status to 'active' so the row leaves this index.
create index children_waitlist_idx
  on public.children (tenant_id, waitlisted_at)
  where status = 'waitlisted';

-- No new RLS policies. children keeps its director/platform_admin-only
-- policies from 20260802224828; rooms keeps rooms_select (tenant-wide, so
-- staff can already read room names for the kiosk) and rooms_write
-- (director/platform_admin) from 20260813090000.
```

- [ ] **Step 3: Verify no database command was run**

Run: `git status --short`
Expected: only the new migration file is untracked/added. Confirm you have not run `supabase` in any form — the database is live production and unlinked.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260815120000_rooms_capacity_and_waitlist.sql
git commit -m "Add rooms capacity/age band and children room_id + waitlist dates

Additive only: room_id is nullable with no backfill and classroom is
retained untouched, because classroom is free text on live records this
project cannot inspect. on delete set null so deleting a room never
deletes children."
```

---

### Task 3: Room capacity and age band in Settings

**PRECONDITION:** `git status` must show `src/lib/kiosk/actions.ts` and `src/app/(app)/settings/page.tsx` clean. If either is dirty with the user's uncommitted work, STOP and report — do not commit their work.

**Files:**
- Modify: `src/lib/kiosk/actions.ts` (the `createRoom` function)
- Modify: `src/app/(app)/settings/page.tsx` (the Rooms section, lines ~104-150)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createRoom` accepting `capacity`, `minAgeMonths`, `maxAgeMonths`; `updateRoom(formData: FormData)` exported from `src/lib/kiosk/actions.ts`.

- [ ] **Step 1: Extend `createRoom` and add `updateRoom`**

In `src/lib/kiosk/actions.ts`, replace the existing `createRoom` with the version below and add `updateRoom` after it. `createRoom` currently reads only `locationId` and `name`.

```ts
/** Optional positive integer from a form field; null when blank or invalid. */
function optionalPositiveInt(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export async function createRoom(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const locationId = formData.get("locationId");
  const name = formData.get("name");

  if (typeof locationId !== "string" || !locationId || typeof name !== "string" || !name.trim()) {
    return;
  }

  const capacity = optionalPositiveInt(formData, "capacity");
  const minAge = optionalPositiveInt(formData, "minAgeMonths");
  const maxAge = optionalPositiveInt(formData, "maxAgeMonths");

  // The DB enforces this too (rooms_age_band_ordered); bail early so the
  // insert doesn't fail on a constraint the director can't see.
  if (minAge !== null && maxAge !== null && minAge > maxAge) return;
  // capacity 0 is meaningless for a room and the DB check rejects it.
  if (capacity !== null && capacity < 1) return;

  const supabase = await createClient();
  await supabase.from("rooms").insert({
    tenant_id: session.profile.tenantId,
    location_id: locationId,
    name: name.trim(),
    capacity,
    min_age_months: minAge,
    max_age_months: maxAge,
  });

  revalidatePath("/settings");
  revalidatePath("/waitlist");
}

export async function updateRoom(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const roomId = formData.get("roomId");
  if (typeof roomId !== "string" || !roomId) return;

  const capacity = optionalPositiveInt(formData, "capacity");
  const minAge = optionalPositiveInt(formData, "minAgeMonths");
  const maxAge = optionalPositiveInt(formData, "maxAgeMonths");

  if (minAge !== null && maxAge !== null && minAge > maxAge) return;
  if (capacity !== null && capacity < 1) return;

  const supabase = await createClient();
  await supabase
    .from("rooms")
    .update({ capacity, min_age_months: minAge, max_age_months: maxAge })
    .eq("id", roomId)
    .eq("tenant_id", session.profile.tenantId);

  revalidatePath("/settings");
  revalidatePath("/waitlist");
}
```

- [ ] **Step 2: Widen the settings rooms query**

In `src/app/(app)/settings/page.tsx`, the rooms query currently selects `"id, name, locations(name)"`. Change it to:

```ts
    supabase
      .from("rooms")
      .select("id, name, capacity, min_age_months, max_age_months, locations(name)")
      .eq("tenant_id", session.profile.tenantId)
      .eq("is_active", true)
      .order("name"),
```

- [ ] **Step 3: Render capacity and age band per room, with an inline edit form**

Replace the `<li>` body inside `activeRooms.map(...)` (currently renders name + location only) with:

```tsx
              <li key={r.id} className="px-4.5 py-3">
                <div className="text-[13.5px] text-gray-700">
                  {r.name} <span className="text-gray-400">&middot; {location?.name}</span>
                </div>
                <form action={updateRoom} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="roomId" value={r.id} />
                  <label className="flex flex-col text-[11px] text-gray-500">
                    Capacity
                    <input
                      type="number"
                      min="1"
                      name="capacity"
                      defaultValue={r.capacity ?? ""}
                      placeholder="—"
                      className="mt-1 w-24 rounded-md border border-gray-300 px-2 py-1 text-[13px] focus:border-[var(--brand-accent)] focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col text-[11px] text-gray-500">
                    Min age (months)
                    <input
                      type="number"
                      min="0"
                      name="minAgeMonths"
                      defaultValue={r.min_age_months ?? ""}
                      placeholder="—"
                      className="mt-1 w-28 rounded-md border border-gray-300 px-2 py-1 text-[13px] focus:border-[var(--brand-accent)] focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col text-[11px] text-gray-500">
                    Max age (months)
                    <input
                      type="number"
                      min="0"
                      name="maxAgeMonths"
                      defaultValue={r.max_age_months ?? ""}
                      placeholder="—"
                      className="mt-1 w-28 rounded-md border border-gray-300 px-2 py-1 text-[13px] focus:border-[var(--brand-accent)] focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Save
                  </button>
                </form>
              </li>
```

- [ ] **Step 4: Add the same three fields to the create-room form**

In the `<form action={createRoom}>` block, after the Location select and before the "Add room" button, insert:

```tsx
          <label className="flex flex-col text-xs text-gray-500">
            Capacity
            <input
              type="number"
              min="1"
              name="capacity"
              placeholder="Optional"
              className="mt-1 w-28 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Min age (months)
            <input
              type="number"
              min="0"
              name="minAgeMonths"
              placeholder="Optional"
              className="mt-1 w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Max age (months)
            <input
              type="number"
              min="0"
              name="maxAgeMonths"
              placeholder="Optional"
              className="mt-1 w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
```

Also update the section's subtitle from "Names staff can transfer between from the kiosk." to "Names staff can transfer between from the kiosk. Capacity drives the waitlist." and add `updateRoom` to the import from `@/lib/kiosk/actions`.

- [ ] **Step 5: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: tsc silent; 27 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kiosk/actions.ts "src/app/(app)/settings/page.tsx"
git commit -m "Add room capacity and age band to settings

Capacity drives waitlist occupancy; the age band is stored now because
ratio tracking needs it. All three are optional -- a room with no
capacity reports occupancy without an open/full verdict."
```

---

### Task 4: Database types

**Files:**
- Modify: `src/types/database.types.ts`

**Interfaces:**
- Produces: `rooms` Row/Insert with `capacity`, `min_age_months`, `max_age_months`; `children` Row/Insert with `room_id`, `waitlisted_at`, `desired_start_date`; a `children_room_id_fkey` relationship entry.

- [ ] **Step 1: Add the three `rooms` columns**

In the `rooms` table's `Row`, add after `is_active`:

```ts
          capacity: number | null;
          min_age_months: number | null;
          max_age_months: number | null;
```

And in its `Insert`:

```ts
          capacity?: number | null;
          min_age_months?: number | null;
          max_age_months?: number | null;
```

- [ ] **Step 2: Add the three `children` columns**

In the `children` `Row`, add after `start_date`:

```ts
          room_id: string | null;
          waitlisted_at: string | null;
          desired_start_date: string | null;
```

And in its `Insert`:

```ts
          room_id?: string | null;
          waitlisted_at?: string | null;
          desired_start_date?: string | null;
```

- [ ] **Step 3: Add the foreign-key relationship entry**

In the `children` table's `Relationships` array, alongside the existing `children_location_id_fkey` entry, add:

```ts
          {
            foreignKeyName: "children_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: silent. If it reports errors in files you did not touch, they belong to the user's unrelated work — report them, do not fix them.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.types.ts
git commit -m "Add rooms capacity/age and children room_id + waitlist dates to types"
```

If `src/types/database.types.ts` also contains the user's uncommitted work at this point, stage only your own hunks — build a patch with `git diff -- src/types/database.types.ts > /tmp/mine.patch`, edit it down to your hunks, and `git apply --cached`. Do not commit any `intensive_*` content.

---

### Task 5: Waitlist queries

**Files:**
- Create: `src/lib/rooms/queries.ts`

**Interfaces:**
- Consumes: `occupancyFor`, `daysWaiting`, `RoomOccupancy` from `src/lib/rooms/occupancy.ts`; `createClient` from `@/lib/supabase/server`.
- Produces:
  - `export interface WaitlistChild { id: string; fullName: string; dob: string; daysWaiting: number | null; waitlistedAt: string | null; desiredStartDate: string | null; }`
  - `export interface WaitlistGroup { roomId: string | null; roomName: string; locationName: string | null; occupancy: RoomOccupancy; waiting: WaitlistChild[]; }`
  - `export async function getWaitlist(supabase: SupabaseClient<Database>, tenantId: string): Promise<WaitlistGroup[]>`

- [ ] **Step 1: Write the module**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import { daysWaiting, occupancyFor, type RoomOccupancy } from "./occupancy";

export interface WaitlistChild {
  id: string;
  fullName: string;
  dob: string;
  daysWaiting: number | null;
  waitlistedAt: string | null;
  desiredStartDate: string | null;
}

export interface WaitlistGroup {
  /** null is the "Unassigned" bucket -- waiting before a room is decided. */
  roomId: string | null;
  roomName: string;
  locationName: string | null;
  occupancy: RoomOccupancy;
  waiting: WaitlistChild[];
}

/**
 * Every active room plus an Unassigned bucket, each with its seat occupancy
 * and the families waiting for it, ordered longest-waiting first.
 *
 * Occupancy counts only status = 'active' children: waitlisted and inactive
 * children never consume a seat.
 */
export async function getWaitlist(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<WaitlistGroup[]> {
  const [{ data: rooms }, { data: enrolled }, { data: waiting }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, capacity, locations(name)")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("children")
      .select("room_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    supabase
      .from("children")
      .select("id, full_name, dob, room_id, waitlisted_at, desired_start_date, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "waitlisted")
      // waitlisted_at is the ordering key; created_at breaks ties for two
      // families added the same day. nullsFirst: false keeps undated entries
      // at the bottom rather than jumping the queue.
      .order("waitlisted_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  const enrolledByRoom = new Map<string | null, number>();
  for (const row of enrolled ?? []) {
    const key = row.room_id;
    enrolledByRoom.set(key, (enrolledByRoom.get(key) ?? 0) + 1);
  }

  const waitingByRoom = new Map<string | null, WaitlistChild[]>();
  for (const row of waiting ?? []) {
    const child: WaitlistChild = {
      id: row.id,
      fullName: row.full_name,
      dob: row.dob,
      daysWaiting: daysWaiting(row.waitlisted_at),
      waitlistedAt: row.waitlisted_at,
      desiredStartDate: row.desired_start_date,
    };
    const list = waitingByRoom.get(row.room_id);
    if (list) list.push(child);
    else waitingByRoom.set(row.room_id, [child]);
  }

  const groups: WaitlistGroup[] = (rooms ?? []).map((r) => {
    const location = Array.isArray(r.locations) ? r.locations[0] : r.locations;
    return {
      roomId: r.id,
      roomName: r.name,
      locationName: location?.name ?? null,
      occupancy: occupancyFor(r.capacity, enrolledByRoom.get(r.id) ?? 0),
      waiting: waitingByRoom.get(r.id) ?? [],
    };
  });

  // Families waiting with no room yet are real and must not be dropped.
  const unassigned = waitingByRoom.get(null) ?? [];
  if (unassigned.length > 0) {
    groups.push({
      roomId: null,
      roomName: "Unassigned",
      locationName: null,
      occupancy: occupancyFor(null, enrolledByRoom.get(null) ?? 0),
      waiting: unassigned,
    });
  }

  return groups;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rooms/queries.ts
git commit -m "Add waitlist query grouping waiting families by room

Occupancy counts only active children -- waitlisted and inactive never
consume a seat. Families with no room assignment group under Unassigned
rather than being dropped."
```

---

### Task 6: Enroll and waitlist actions

**Files:**
- Create: `src/lib/rooms/actions.ts`

**Interfaces:**
- Consumes: `requireRole` from `@/lib/auth/dal`; `createClient` from `@/lib/supabase/server`; `todayISO` from `@/lib/billing/dates`.
- Produces:
  - `export type WaitlistActionState = { message?: string } | undefined;`
  - `export async function enrollFromWaitlist(prevState: WaitlistActionState, formData: FormData): Promise<WaitlistActionState>`

- [ ] **Step 1: Write the module**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { todayISO } from "@/lib/billing/dates";
import { createClient } from "@/lib/supabase/server";

export type WaitlistActionState = { message?: string } | undefined;

/**
 * Moves a waitlisted child to active. This starts billing: the child begins
 * generating prorated tuition on the next generation run for the period
 * containing startDate, so startDate is required rather than defaulted.
 *
 * desired_start_date is deliberately retained -- it records what the family
 * originally asked for, which stays useful beside the actual start_date.
 */
export async function enrollFromWaitlist(
  prevState: WaitlistActionState,
  formData: FormData,
): Promise<WaitlistActionState> {
  const session = await requireRole(["director", "platform_admin"]);

  const childId = formData.get("childId");
  const startDate = formData.get("startDate");
  const roomIdRaw = formData.get("roomId");

  if (typeof childId !== "string" || !childId) {
    return { message: "Missing child." };
  }
  if (typeof startDate !== "string" || !startDate.trim()) {
    return { message: "Set a start date — billing prorates from it." };
  }

  const roomId = typeof roomIdRaw === "string" && roomIdRaw ? roomIdRaw : null;

  const supabase = await createClient();

  const update: {
    status: "active";
    start_date: string;
    waitlisted_at: null;
    room_id?: string;
  } = {
    status: "active",
    start_date: startDate,
    waitlisted_at: null,
  };
  // Only overwrite the room when one was chosen; never clear an existing
  // assignment by enrolling without picking a room.
  if (roomId) update.room_id = roomId;

  // RLS blocks rather than errors, so a blocked update returns zero rows.
  const { data, error } = await supabase
    .from("children")
    .update(update)
    .eq("id", childId)
    .eq("tenant_id", session.profile.tenantId)
    .eq("status", "waitlisted")
    .select("id")
    .maybeSingle();

  if (error) return { message: "Couldn't enroll this child. Try again." };
  if (!data) return { message: "This child is no longer on the waitlist." };

  revalidatePath("/waitlist");
  revalidatePath("/children");
  revalidatePath(`/children/${childId}`);
  revalidatePath("/dashboard");
}

/** Puts a child on the waitlist, stamping today in the center's timezone. */
export async function addToWaitlist(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);

  const childId = formData.get("childId");
  if (typeof childId !== "string" || !childId) return;

  const supabase = await createClient();
  await supabase
    .from("children")
    .update({ status: "waitlisted", waitlisted_at: todayISO() })
    .eq("id", childId)
    .eq("tenant_id", session.profile.tenantId);

  revalidatePath("/waitlist");
  revalidatePath("/children");
  revalidatePath(`/children/${childId}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rooms/actions.ts
git commit -m "Add enroll-from-waitlist and add-to-waitlist actions

Enrolling requires a start date because billing prorates from it, and
clears waitlisted_at while retaining desired_start_date. The status
predicate on the update makes a double-enroll a no-op rather than a
silent second write."
```

---

### Task 7: Waitlist page and enroll control

**Files:**
- Create: `src/components/rooms/enroll-form.tsx`
- Create: `src/app/(app)/waitlist/page.tsx`

**Interfaces:**
- Consumes: `getWaitlist`, `WaitlistGroup` from `src/lib/rooms/queries.ts`; `enrollFromWaitlist`, `WaitlistActionState` from `src/lib/rooms/actions.ts`; `requireRole`; `createClient`; `todayISO`.

- [ ] **Step 1: Write the enroll form client component**

```tsx
"use client";

import { useActionState } from "react";

import { enrollFromWaitlist, type WaitlistActionState } from "@/lib/rooms/actions";

export function EnrollForm({
  childId,
  roomId,
  defaultStartDate,
}: {
  childId: string;
  roomId: string | null;
  defaultStartDate: string;
}) {
  const [state, action, pending] = useActionState<WaitlistActionState, FormData>(
    enrollFromWaitlist,
    undefined,
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="childId" value={childId} />
      {roomId && <input type="hidden" name="roomId" value={roomId} />}
      <label className="flex flex-col text-[11px] text-gray-500">
        Start date
        <input
          type="date"
          name="startDate"
          defaultValue={defaultStartDate}
          required
          className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-[13px] focus:border-[var(--brand-accent)] focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[#06323A] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Enrolling…" : "Enroll"}
      </button>
      {state?.message && (
        <p role="alert" className="w-full text-[12px] font-medium text-red-700">
          {state.message}
        </p>
      )}
      <p className="w-full text-[11px] text-gray-400">
        Enrolling starts billing from the start date.
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Write the waitlist page**

```tsx
import Link from "next/link";

import { requireRole } from "@/lib/auth/dal";
import { todayISO } from "@/lib/billing/dates";
import { getWaitlist } from "@/lib/rooms/queries";
import { createClient } from "@/lib/supabase/server";
import { EnrollForm } from "@/components/rooms/enroll-form";

export default async function WaitlistPage() {
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const groups = await getWaitlist(supabase, session.profile.tenantId);
  const today = todayISO();
  const totalWaiting = groups.reduce((sum, g) => sum + g.waiting.length, 0);

  return (
    <div className="max-w-[1000px]">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold text-gray-900">Waitlist</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {totalWaiting} {totalWaiting === 1 ? "family" : "families"} waiting &middot; seats
            shown are capacity, not staffing ratio
          </p>
        </div>
        <Link
          href="/settings"
          className="text-[12.5px] font-semibold text-[var(--brand-primary)] hover:opacity-80"
        >
          Set room capacity &rarr;
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <section
            key={g.roomId ?? "unassigned"}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 px-4.5 py-3.5">
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">{g.roomName}</h2>
              {g.locationName && (
                <span className="text-[11.5px] text-gray-400">{g.locationName}</span>
              )}
              <span className="text-[13px] text-gray-600 tabular-nums">
                {g.occupancy.capacity === null
                  ? `${g.occupancy.enrolled} enrolled · capacity not set`
                  : `${g.occupancy.enrolled}/${g.occupancy.capacity} enrolled`}
              </span>
              {g.occupancy.capacity !== null && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                    g.occupancy.isFull
                      ? "bg-amber-50 text-amber-700"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  {g.occupancy.isFull
                    ? "Full"
                    : `${g.occupancy.openSpots} open`}
                </span>
              )}
              <span className="ml-auto text-[11.5px] text-gray-400">
                {g.waiting.length} waiting
              </span>
            </div>

            <ul className="divide-y divide-gray-100">
              {g.waiting.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-start gap-3 px-4.5 py-3">
                  <span className="mt-0.5 w-5 shrink-0 text-[12px] font-semibold text-gray-400 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/children/${c.id}`}
                      className="text-[13.5px] font-semibold text-gray-900 hover:text-[var(--brand-primary)]"
                    >
                      {c.fullName}
                    </Link>
                    <div className="mt-0.5 text-[11.5px] text-gray-400">
                      {c.daysWaiting === null
                        ? "No waitlist date"
                        : `Waiting ${c.daysWaiting} ${c.daysWaiting === 1 ? "day" : "days"}`}
                      {c.desiredStartDate ? ` · wants ${c.desiredStartDate}` : ""}
                    </div>
                  </div>
                  <EnrollForm
                    childId={c.id}
                    roomId={g.roomId}
                    defaultStartDate={c.desiredStartDate ?? today}
                  />
                </li>
              ))}
              {g.waiting.length === 0 && (
                <li className="px-4.5 py-6 text-center text-sm text-gray-500">
                  Nobody waiting for this room.
                </li>
              )}
            </ul>
          </section>
        ))}

        {groups.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-4.5 py-6 text-center text-sm text-gray-500">
            No rooms yet. Add rooms in Settings to start tracking a waitlist.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: tsc silent; 27 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/rooms/enroll-form.tsx "src/app/(app)/waitlist/page.tsx"
git commit -m "Add waitlist page grouped by room with enroll control

Enrolling into a full room is permitted with the occupancy shown rather
than blocked -- centers exceed seat counts temporarily, and licensing
capacity is a ratio question this feature deliberately does not answer."
```

---

### Task 8: Wire into the portal

**Files:**
- Modify: `src/lib/nav/nav-items.ts`
- Modify: `src/app/(app)/children/page.tsx` (director branch)
- Modify: `src/app/(app)/children/[childId]/page.tsx` (director branch form)
- Modify: `src/lib/children/actions.ts` (`updateChild`)

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Add the Waitlist nav entry**

In `src/lib/nav/nav-items.ts`, add `ClipboardList` to the `lucide-react` import, then extend the director/platform_admin branch's `Children` section:

```ts
      {
        label: "Children",
        items: [
          { title: "Children & guardians", href: "/children", icon: Baby },
          { title: "Waitlist", href: "/waitlist", icon: ClipboardList },
        ],
      },
```

Leave the staff branch untouched — staff have no waitlist surface.

- [ ] **Step 2: Persist the new fields in `updateChild`**

In `src/lib/children/actions.ts`, inside `updateChild`'s `.update({...})` object, add:

```ts
      room_id: str(formData, "roomId"),
      waitlisted_at: str(formData, "waitlistedAt"),
      desired_start_date: str(formData, "desiredStartDate"),
```

`str()` already returns `null` for a blank field, which correctly clears an assignment.

- [ ] **Step 3: Add a status filter to the children list**

In `src/app/(app)/children/page.tsx`, the director branch currently renders every child. Waitlisted children sit mixed into the roster with no way to separate them. Pass the status through to the existing client table by adding a `status` field to each mapped row (the query already selects `status`), then in `src/components/children/children-table.tsx` add a status filter alongside the existing location pills:

```tsx
  const [status, setStatus] = useState("All");
```

Add to the filter row, after the location pills:

```tsx
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-[13px] text-gray-700 outline-none focus:border-[var(--brand-accent)]"
        >
          <option value="All">All statuses</option>
          <option value="active">Active</option>
          <option value="waitlisted">Waitlisted</option>
          <option value="inactive">Inactive</option>
        </select>
```

And extend the `filtered` predicate:

```ts
      const matchesStatus = status === "All" || r.status === status;
      return matchesLocation && matchesSearch && matchesStatus;
```

- [ ] **Step 4: Add room and waitlist fields to the child detail form**

In `src/app/(app)/children/[childId]/page.tsx`, widen the child query to select `room_id, waitlisted_at, desired_start_date`, and fetch rooms for the child's location:

```ts
    supabase
      .from("rooms")
      .select("id, name")
      .eq("tenant_id", session.profile.tenantId)
      .eq("is_active", true)
      .order("name"),
```

Then in the "Child & billing details" form, after the Classroom input, add:

```tsx
            <label className="flex flex-col text-xs text-gray-500">
              Room
              <select
                name="roomId"
                defaultValue={child.room_id ?? ""}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              >
                <option value="">Unassigned</option>
                {(rooms ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Waitlisted on
              <input
                type="date"
                name="waitlistedAt"
                defaultValue={child.waitlisted_at ?? ""}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Desired start date
              <input
                type="date"
                name="desiredStartDate"
                defaultValue={child.desired_start_date ?? ""}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
            </label>
```

Relabel the existing Classroom input's placeholder to `Classroom (legacy — use Room above)` so a director knows which field is current.

- [ ] **Step 5: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: tsc silent; 27 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav/nav-items.ts src/lib/children/actions.ts "src/app/(app)/children/page.tsx" "src/app/(app)/children/[childId]/page.tsx" src/components/children/children-table.tsx
git commit -m "Wire waitlist into nav, child detail, and children list

Adds room assignment and waitlist dates to the child form, a status
filter to the roster, and the Waitlist nav entry. classroom is relabelled
legacy rather than removed."
```

---

### Task 9: Apply checklist

**Files:**
- Modify: `docs/BILLING-APPLY-CHECKLIST.md` (append a rooms/waitlist section) OR create `docs/ROOMS-WAITLIST-APPLY-CHECKLIST.md`

Create a separate document — the billing checklist is already 524 lines and covers a different migration set.

**Files:**
- Create: `docs/ROOMS-WAITLIST-APPLY-CHECKLIST.md`

- [ ] **Step 1: Write the checklist**

Cover, each with concrete SQL and the expected result:

1. **Migration order.** `20260815120000_rooms_capacity_and_waitlist.sql` applies after every billing migration. Not re-runnable.
2. **Nothing was destroyed.** Confirm `children.classroom` still holds its original values and every existing child has `room_id is null`:
   `select count(*) filter (where classroom is not null) as has_classroom, count(*) filter (where room_id is null) as unassigned from public.children;`
3. **The reconciliation query** — the mapping a director needs before assigning rooms:
   `select c.classroom, count(*) as children, (select string_agg(r.name, ', ') from public.rooms r where r.tenant_id = c.tenant_id and r.is_active) as existing_rooms from public.children c where c.tenant_id = '<TENANT_ID>'::uuid group by c.classroom, c.tenant_id order by children desc;`
   Expected: a list of distinct free-text classroom values beside the real rooms, so the director can see what maps to what before touching anything.
4. **`on delete set null` preserves children.** In a transaction that is rolled back: delete a room that has children assigned, confirm the children survive with `room_id is null`, then `rollback`.
5. **Age-band constraint holds.** Attempt `update public.rooms set min_age_months = 24, max_age_months = 12` and confirm it is rejected by `rooms_age_band_ordered`.
6. **Capacity constraint holds.** Attempt `update public.rooms set capacity = 0` and confirm rejection by `rooms_capacity_positive`.
7. **The partial index is used.** `explain analyze select id from public.children where tenant_id = '<TENANT_ID>'::uuid and status = 'waitlisted' order by waitlisted_at;` — expect `children_waitlist_idx`.
8. **Staff still cannot read children.** From a staff session, `select * from public.children` returns zero rows (RLS unchanged by this migration), while `select * from public.child_balance_status` still returns their roster.
9. **UI pass.** Set a capacity in Settings, put a child on the waitlist from their detail page, confirm they appear under the right room on `/waitlist` with the correct days-waiting, enroll them with a start date, and confirm they move to Active and disappear from the waitlist. Then confirm the next billing generation run creates a prorated charge for them.

- [ ] **Step 2: Commit**

```bash
git add docs/ROOMS-WAITLIST-APPLY-CHECKLIST.md
git commit -m "Add rooms and waitlist apply checklist

Includes the classroom-to-room reconciliation query a director needs
before assigning rooms, and a non-destructive verification that the
migration changed no existing child data."
```

---

## Self-review notes

**Spec coverage:** rooms capacity/age band → Task 2, 3; children room_id/waitlist dates → Task 2, 4, 8; waitlist screen with occupancy and ordering → Task 5, 7; enroll integrating with billing → Task 6, 7; status filter on the roster → Task 8; nav → Task 8; `classroom` retained → Task 2 (comment), Task 8 (relabel); migration safety and reconciliation query → Task 9; Vitest for occupancy and days-waiting → Task 1. No spec requirement is unimplemented.

**Deliberate omissions:** no manual waitlist priority and no sibling-first rule (spec non-goal — those are AKPA's enrollment policy to state, not this plan's to invent); no ratio computation (separate spec); no parent-facing waitlist signup (needs the deferred parent portal); no backfill of `classroom` (governing constraint).

**Known ordering dependency:** Task 3 requires the user's kiosk work committed first. Task 4's types are consumed by Tasks 5-8, so it must not slip later.
