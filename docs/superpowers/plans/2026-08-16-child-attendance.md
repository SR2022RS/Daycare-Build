# Child Check-In / Check-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record which children are physically present, and who dropped them off and collected them, through the existing door kiosk.

**Architecture:** A `guardian_pins` table mirroring `profile_pins` exactly (bcrypt, no RLS policies, service-role-only RPCs), and a `child_attendance` table holding one row per visit so a child who leaves mid-day stops counting as present. The kiosk gains a mode switch: guardians check their own children in and out with a PIN, staff can act on their behalf, and every row records which of the two happened.

**Tech Stack:** Next.js 16 (Server Components + Server Actions), Supabase (Postgres, RLS, `security definer` RPCs, pgcrypto), TypeScript, Tailwind (hand-written), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-child-attendance-design.md`

**Scope note:** this plan is the first of two from that spec. It delivers attendance end to end, with check-out recording *who* collected a child but not yet validating them. A second plan adds pickup authorization as structured data and the three-tier enforcement rule. Attendance is useful on its own; enforcement is not useful without it.

## Global Constraints

- **The kiosk is unauthenticated and must never hold a write policy.** No RPC in this repo is granted to `anon` — verified across every migration. The kiosk works through the `device_token` UUID in the URL acting as a bearer credential, re-validated server-side on every call, plus `createAdminClient()` (service role) inside `"use server"` actions. Mirror this exactly.
- Revoke convention by intended caller: authenticated-callable → `from public, anon`; service-role-only → `from public, anon, authenticated`; internal/trigger-only → `from public, anon, authenticated, service_role`. `revoke ... from public` alone is insufficient on Supabase.
- PIN functions must use `set search_path = public, extensions` — pgcrypto (`crypt`, `gen_salt`) lives in `extensions`, and plain `public` will not resolve it.
- PINs are bcrypt: `crypt(p_pin, gen_salt('bf'))`, verified with `crypt(p_pin, hash) = hash`. Never store or log a plaintext PIN except in the single director-facing response that displays a newly generated one.
- PIN format is 4–6 digits, gated by `'^[0-9]{4,6}$'` in SQL before any hashing work.
- Migration filenames `YYYYMMDDHHMMSS_snake_case.sql`, timestamped after `20260816090000_intensive_reminders.sql`. None are re-runnable.
- **No database or `supabase` commands.** The project is unlinked and the database is live production. Migrations are delivered as files for the director to apply.
- NEVER `git add -A` / `git add .` / `git commit -a`. Stage only the files a task names.
- No UI component library. Hand-written Tailwind. The kiosk has its own dark visual language — reuse its exact class strings (below), not the portal's.
- `todayISO()` from `@/lib/billing/dates` for any date; never `new Date().toISOString().slice(0,10)` in new code.
- `npx tsc --noEmit` clean and `npm test` passing before every commit.

### Kiosk visual vocabulary (from `src/components/kiosk/kiosk-client.tsx`)

- Shell: `"flex min-h-screen flex-col items-center justify-center bg-[#0D0D10] px-4 py-10 text-center"`
- Card: `"w-full max-w-[380px] rounded-2xl border border-[var(--brand-accent)]/20 bg-[#17171C] p-6"`
- Heading: `"mb-5 font-serif text-lg font-semibold text-[#F5F3EE]"`
- Keypad digit: `"h-16 rounded-xl bg-[#0D0D10] text-xl font-semibold text-[#F5F3EE] hover:bg-[var(--brand-accent)]/10 active:bg-[var(--brand-accent)]/20"`
- Primary CTA: `"h-16 rounded-xl bg-[var(--brand-accent)] text-sm font-bold tracking-[.08em] text-[#06323A] uppercase hover:opacity-90 disabled:opacity-50"`
- Secondary: `"h-12 rounded-xl border border-[var(--brand-accent)]/30 text-xs font-semibold tracking-[.08em] text-[#F5F3EE] uppercase hover:bg-[var(--brand-accent)]/10 disabled:opacity-40"`
- Error: `"mb-4 text-sm text-red-400"`

---

### Task 1: Schema

**Files:**
- Create: `supabase/migrations/20260817120000_child_attendance.sql`

**Interfaces:**
- Produces: `guardian_pins`, `child_attendance`, `children.pickup_code_word`, `kiosk_pin_attempts.guardian_id`.

- [ ] **Step 1: Read the tables being mirrored**

Read `supabase/migrations/20260804090000_pin_login.sql` (the `profile_pins` shape and its deliberate absence of RLS policies) and `supabase/migrations/20260813090000_kiosk_access.sql` (`kiosk_devices`, `kiosk_sessions`, `kiosk_pin_attempts`). Match their comment banners and rationale-comment style.

- [ ] **Step 2: Write the migration**

```sql
-- Child check-in/out. Presence, not enrollment: the ratio work that follows
-- needs to know who is actually in the building, and until now nothing did.
--
-- Guardian PINs mirror profile_pins exactly -- bcrypt, no RLS policies, only
-- SECURITY DEFINER functions and the service-role admin client may touch them.
-- A 4-digit PIN has 10,000 possible values, so the hash table must never be
-- readable, and the kiosk must never be able to enumerate it.

-- ── guardian_pins ────────────────────────────────────────────────────────
create table public.guardian_pins (
  guardian_id uuid primary key references public.guardians (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index guardian_pins_tenant_id_idx on public.guardian_pins (tenant_id);

-- Deliberately NO policies, matching profile_pins.
alter table public.guardian_pins enable row level security;

-- ── child_attendance ─────────────────────────────────────────────────────
-- One row per VISIT, not per day. Children leave for appointments and come
-- back, and a child who left at 11am must stop counting toward a ratio.
-- "Currently present" is checked_out_at is null.
create table public.child_attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  -- Defaults from children.room_id, but staff may place a child elsewhere for
  -- the day, and the ratio must reflect where the child actually is.
  room_id uuid references public.rooms (id) on delete set null,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  in_by_guardian_id uuid references public.guardians (id) on delete set null,
  in_by_staff_id uuid references public.profiles (id) on delete set null,
  out_by_guardian_id uuid references public.guardians (id) on delete set null,
  out_by_staff_id uuid references public.profiles (id) on delete set null,
  -- Set when staff released a child to someone not on the authorized list.
  -- Enforcement arrives in the pickup-authorization plan; the column exists
  -- now so the audit trail is complete from the first check-out.
  out_override_reason text,
  created_at timestamptz not null default now(),

  -- Exactly one actor on the way in: either the guardian authenticated, or
  -- staff vouched. An audit must be able to tell those apart.
  constraint child_attendance_in_actor
    check (num_nonnulls(in_by_guardian_id, in_by_staff_id) = 1),
  -- And exactly one on the way out, but only once there is a way out.
  constraint child_attendance_out_actor
    check (
      (checked_out_at is null and num_nonnulls(out_by_guardian_id, out_by_staff_id) = 0)
      or (checked_out_at is not null and num_nonnulls(out_by_guardian_id, out_by_staff_id) = 1)
    ),
  constraint child_attendance_out_after_in
    check (checked_out_at is null or checked_out_at >= checked_in_at)
);

-- The live view: who is present, by room. Partial, because the open visits are
-- a tiny slice of the table after a few months.
create index child_attendance_present_idx
  on public.child_attendance (tenant_id, room_id)
  where checked_out_at is null;

create index child_attendance_child_idx
  on public.child_attendance (child_id, checked_in_at desc);

-- A child cannot be in two places at once. Also makes check-in idempotent:
-- a second tap hits this and is turned into a no-op by the RPC.
create unique index child_attendance_one_open_visit
  on public.child_attendance (child_id)
  where checked_out_at is null;

alter table public.child_attendance enable row level security;

-- Staff need to see today's roster for their own location to run a room;
-- directors see the whole tenant. Writes never happen through RLS -- only
-- through the SECURITY DEFINER RPCs below, called by the kiosk's admin client.
create policy "child_attendance_select" on public.child_attendance
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or public.has_location_access(location_id)
    )
  );

create policy "child_attendance_write" on public.child_attendance
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

-- ── children.pickup_code_word ────────────────────────────────────────────
-- Collected by the pickup_authorization form today but trapped in JSONB. The
-- fallback when someone unexpected arrives and staff verify by phone.
alter table public.children add column pickup_code_word text;

-- ── kiosk_pin_attempts.guardian_id ───────────────────────────────────────
-- The attempt log's profile_id references profiles, so a guardian attempt has
-- nowhere to go. Add a parallel column rather than loosening that FK.
alter table public.kiosk_pin_attempts
  add column guardian_id uuid references public.guardians (id) on delete set null;
```

- [ ] **Step 3: Confirm no database command was run**

Run: `git status --short`
Expected: only the new migration file. Confirm you have not run `supabase` in any form.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260817120000_child_attendance.sql
git commit -m "Add child attendance and guardian PIN schema

One row per visit rather than per day: children leave for appointments
and return, and a child who left at 11am must stop counting toward a
ratio. A partial unique index on open visits makes check-in idempotent
and stops a child being in two rooms at once.

guardian_pins mirrors profile_pins including its deliberate absence of
RLS policies -- a 4-digit PIN has 10,000 possible values, so only the
definer functions and the service-role client may ever touch the hash."
```

---

### Task 2: Kiosk RPCs

**Files:**
- Create: `supabase/migrations/20260817120100_child_attendance_rpcs.sql`

**Interfaces:**
- Produces: `admin_set_guardian_pin(uuid, text)`, `kiosk_identify_guardian_pin(uuid, text)`, `kiosk_check_child_in(uuid, uuid, uuid, uuid)`, `kiosk_check_child_out(uuid, uuid, uuid, text)`.

- [ ] **Step 1: Read the functions being mirrored**

Read `kiosk_identify_pin` and `admin_set_staff_pin` in `supabase/migrations/20260813090000_kiosk_access.sql` in full. Reproduce their structure: `select ... for update` on the device, lockout check, PIN regex gate, candidate loop with `crypt`, attempt logging, and the exact revoke/grant lines.

- [ ] **Step 2: Write the migration**

Reproduce the four functions below. Match the existing files' comment banners.

`admin_set_guardian_pin(p_guardian_id uuid, p_pin text) returns void` — plpgsql, `security definer`, `set search_path = public, extensions`. Mirrors `admin_set_staff_pin`: refuse unless `current_role()` is director/platform_admin; gate `p_pin !~ '^[0-9]{4,6}$'` with `raise exception 'PIN must be 4 to 6 digits'`; verify the guardian's `tenant_id` matches `current_tenant_id()`; scan the tenant's other guardian PINs for a collision and `raise exception 'pin_taken'`; upsert `on conflict (guardian_id) do update`.
Grants: `revoke all on function public.admin_set_guardian_pin(uuid, text) from public, anon;` then `grant execute ... to authenticated;`

`kiosk_identify_guardian_pin(p_device_token uuid, p_pin text) returns uuid` — plpgsql, `security definer`, `set search_path = public, extensions`. Mirrors `kiosk_identify_pin`, with one difference in candidate scoping: staff are scoped by `staff_locations`, but guardians have no location link, so scope by **tenant plus having at least one child at the device's location**:

```sql
for r in (
  select gp.guardian_id, gp.pin_hash
  from public.guardian_pins gp
  where gp.tenant_id = v_device.tenant_id
    and exists (
      select 1
      from public.child_guardians cg
      join public.children c on c.id = cg.child_id
      where cg.guardian_id = gp.guardian_id
        and c.location_id = v_device.location_id
        and c.status = 'active'
    )
) loop
  if crypt(p_pin, r.pin_hash) = r.pin_hash then v_match := r.guardian_id; exit; end if;
end loop;
```

Reuse `kiosk_devices.failed_attempts` / `locked_until` for lockout (device-scoped, same as staff) and log to `kiosk_pin_attempts` setting the new `guardian_id` column.
Grants: `revoke all on function public.kiosk_identify_guardian_pin(uuid, text) from public, anon, authenticated;` then `grant execute ... to service_role;`

`kiosk_check_child_in(p_child_id uuid, p_room_id uuid, p_guardian_id uuid, p_staff_id uuid) returns uuid` — plpgsql, `security definer`, `set search_path = public`. Rejects unless the child is `status = 'active'`. Resolves `room_id` from the argument, falling back to `children.room_id`. If an open visit already exists, returns its id unchanged (idempotent — a second tap must not create a second visit). Otherwise inserts and returns the new id. Raises if both or neither actor argument is null.
Grants: `revoke ... from public, anon, authenticated;` `grant execute ... to service_role;`

`kiosk_check_child_out(p_child_id uuid, p_guardian_id uuid, p_staff_id uuid, p_override_reason text) returns uuid` — same shape. Finds the open visit; raises a distinguishable `no_open_visit` exception if there is none; sets `checked_out_at = now()` and the actor. Same grants.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260817120100_child_attendance_rpcs.sql
git commit -m "Add kiosk RPCs for guardian PIN and child check-in/out

Mirrors the staff kiosk exactly: revoked from anon and authenticated,
granted only to service_role, and reached solely through the device
token plus the admin client. No RPC in this codebase is callable by
anon, and these are no exception.

Guardian candidates are scoped by tenant plus having an active child at
the device's location -- guardians have no staff_locations row to scope
by, and an unscoped candidate loop would be a tenant-wide PIN oracle."
```

---

### Task 3: Types and pure logic

**Files:**
- Modify: `src/types/database.types.ts`
- Create: `src/lib/attendance/child-visits.ts`
- Create: `src/lib/attendance/child-visits.test.ts`

**Interfaces:**
- Produces: `guardian_pins` / `child_attendance` table types; `children.pickup_code_word`; `kiosk_pin_attempts.guardian_id`; and
  - `export interface PresentChild { visitId: string; childId: string; fullName: string; roomId: string | null; roomName: string; checkedInAt: string; hoursPresent: number; }`
  - `export function hoursPresent(checkedInAt: string, now?: Date): number`
  - `export function isStaleVisit(checkedInAt: string, now?: Date): boolean`

- [ ] **Step 1: Add the database types**

Add `guardian_pins` and `child_attendance` to `Tables`, `pickup_code_word: string | null` to `children` Row/Insert, and `guardian_id: string | null` to `kiosk_pin_attempts`. Add the four new functions to the `Functions` block with their exact argument names. `src/types/database.types.ts` is hand-authored and shared — additive changes only, no reformatting.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { hoursPresent, isStaleVisit } from "./child-visits";

const at = (iso: string) => new Date(iso);

describe("hoursPresent", () => {
  it("measures a part-day visit", () => {
    expect(hoursPresent("2026-08-17T08:00:00Z", at("2026-08-17T11:30:00Z"))).toBe(3.5);
  });

  it("rounds to one decimal", () => {
    expect(hoursPresent("2026-08-17T08:00:00Z", at("2026-08-17T08:20:00Z"))).toBe(0.3);
  });

  it("never reports negative time for a clock skew", () => {
    expect(hoursPresent("2026-08-17T09:00:00Z", at("2026-08-17T08:00:00Z"))).toBe(0);
  });
});

describe("isStaleVisit", () => {
  it("accepts a normal day", () => {
    expect(isStaleVisit("2026-08-17T08:00:00Z", at("2026-08-17T17:00:00Z"))).toBe(false);
  });

  it("flags a visit still open after 12 hours", () => {
    // Nobody's child is at daycare for 12 hours; this is a missed check-out,
    // and it must be flagged rather than silently closed.
    expect(isStaleVisit("2026-08-17T07:00:00Z", at("2026-08-17T19:30:00Z"))).toBe(true);
  });

  it("flags a visit left open overnight", () => {
    expect(isStaleVisit("2026-08-17T08:00:00Z", at("2026-08-18T08:00:00Z"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/attendance/child-visits.test.ts`
Expected: FAIL — cannot find module `./child-visits`.

- [ ] **Step 4: Write the implementation**

```ts
/** A visit open longer than this is a missed check-out, not a long day. */
const STALE_VISIT_HOURS = 12;

export interface PresentChild {
  visitId: string;
  childId: string;
  fullName: string;
  roomId: string | null;
  roomName: string;
  checkedInAt: string;
  hoursPresent: number;
}

export function hoursPresent(checkedInAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(checkedInAt).getTime();
  // Clock skew between the kiosk and the server shouldn't render as negative
  // time on a roster a staff member is reading.
  return Math.max(0, Math.round((ms / 3_600_000) * 10) / 10);
}

/**
 * A visit still open after half a day almost certainly means someone forgot to
 * check the child out. It is flagged rather than auto-closed: inventing a
 * departure time would corrupt the very record an audit relies on.
 */
export function isStaleVisit(checkedInAt: string, now: Date = new Date()): boolean {
  return hoursPresent(checkedInAt, now) >= STALE_VISIT_HOURS;
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/lib/attendance/child-visits.test.ts && npx tsc --noEmit`
Expected: 6 tests pass; tsc silent.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts src/lib/attendance/child-visits.ts src/lib/attendance/child-visits.test.ts
git commit -m "Add child visit types and duration helpers"
```

---

### Task 4: Kiosk server actions

**Files:**
- Modify: `src/lib/kiosk/actions.ts`
- Modify: `src/lib/kiosk/definitions.ts`

**Interfaces:**
- Consumes: `createAdminClient`, the four RPCs from Task 2.
- Produces:
  - `export interface GuardianIdentity { ok: true; sessionToken: string; guardianName: string; children: { id: string; fullName: string; roomName: string | null; present: boolean }[] } | { ok: false; message: string }`
  - `kioskIdentifyGuardian(deviceToken: string, pin: string)`
  - `kioskCheckChildIn(sessionToken: string, childId: string)`
  - `kioskCheckChildOut(sessionToken: string, childId: string)`
  - `kioskStaffCheckChild(sessionToken: string, childId: string, direction: "in" | "out")`

- [ ] **Step 1: Extend the session table usage**

`kiosk_sessions.profile_id` is `not null` and references `profiles`, so a guardian session cannot reuse it as-is. Add to the Task 1 migration pattern a follow-up migration `supabase/migrations/20260817120200_kiosk_guardian_sessions.sql` making `profile_id` nullable, adding `guardian_id uuid references public.guardians (id) on delete cascade`, and a check that exactly one of the two is set. Commit it with this task.

- [ ] **Step 2: Write the guardian actions**

Follow the shape of `kioskIdentify` exactly: regex-gate the PIN, `createAdminClient()`, look up the device by `device_token`, call the RPC, mint a `kiosk_sessions` row, return a session token. Then list that guardian's children with their current presence (`child_attendance` where `checked_out_at is null`).

`kioskCheckChildIn` / `kioskCheckChildOut` resolve the session (reusing the existing private `resolveSession`, extended to return `guardian_id`), verify the child actually belongs to that guardian via `child_guardians`, then call the RPC with `p_guardian_id` set and `p_staff_id` null.

`kioskStaffCheckChild` resolves a *staff* session and calls the RPC with `p_staff_id` set and `p_guardian_id` null, so the row records that staff vouched.

Every one of these must re-verify the relationship server-side. The client sends a `childId`; it must never be trusted.

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/lib/kiosk/actions.ts src/lib/kiosk/definitions.ts supabase/migrations/20260817120200_kiosk_guardian_sessions.sql
git commit -m "Add kiosk actions for guardian identify and child check-in/out

Every action re-verifies server-side that the child belongs to the
guardian holding the session. The client sends a child id and is never
trusted with it."
```

---

### Task 5: Kiosk UI

**Files:**
- Modify: `src/components/kiosk/kiosk-client.tsx`
- Modify: `src/app/kiosk/[deviceToken]/page.tsx`

- [ ] **Step 1: Add the mode switch**

The client's state machine is `view: "pad" | "menu" | "incident"`. Add a `"mode"` screen shown first, offering *"I'm staff"* and *"I'm dropping off or picking up"*, then extend `view` with `"guardianPad" | "guardianMenu" | "staffRoster"`. Preserve the existing `IDLE_RESET_MS` idle reset and `CONFIRM_RESET_MS` confirmation behaviour on every new screen — a kiosk left on a child's name is a privacy leak.

- [ ] **Step 2: Guardian screens**

`guardianPad` reuses the existing keypad markup verbatim. `guardianMenu` lists the guardian's children as large touch targets showing present/absent state, each tapping through to check in or out. Use the kiosk class strings from Global Constraints — this screen is used by parents at a door, so targets must be at least `h-16`.

- [ ] **Step 3: Staff roster screen**

Reached from the existing staff menu. Lists the children at the device's location grouped by room, each with an in/out control calling `kioskStaffCheckChild`.

- [ ] **Step 4: Typecheck, build and commit**

Run: `npx tsc --noEmit && npm test && npm run build`

```bash
git add src/components/kiosk/kiosk-client.tsx "src/app/kiosk/[deviceToken]/page.tsx"
git commit -m "Add child check-in/out screens to the kiosk"
```

---

### Task 6: Guardian PIN management

**Files:**
- Modify: `src/lib/children/actions.ts`
- Modify: `src/app/(app)/children/[childId]/page.tsx`

- [ ] **Step 1: Add the action**

`resetGuardianPin(_state, formData)` in `src/lib/children/actions.ts`, following `resetStaffPin` in `src/lib/kiosk/actions.ts` exactly — including its `useActionState` signature, since it must return the generated plaintext PIN once for the director to hand over, and its retry loop on the `pin_taken` exception.

- [ ] **Step 2: Add the control**

The guardian `<li>` in the child detail page already holds "Make payer" and "Remove" forms styled `"text-[11px] font-medium text-gray-400 hover:..."`. Add a third control in the same row for issuing or resetting a kiosk PIN, and render the returned PIN prominently and once, with wording making clear it will not be shown again.

- [ ] **Step 3: Typecheck and commit**

```bash
git add src/lib/children/actions.ts "src/app/(app)/children/[childId]/page.tsx"
git commit -m "Let directors issue guardian kiosk PINs from the child page

Guardian PINs sit with the family rather than in Settings: a director
issuing one is already looking at that child's record."
```

---

### Task 7: Who's here

**Files:**
- Create: `src/lib/attendance/child-presence.ts`
- Create: `src/app/(app)/attendance/children/page.tsx`
- Modify: `src/lib/nav/nav-items.ts`

**Interfaces:**
- Produces: `getPresentChildren(supabase, tenantId)` → `{ rooms: { roomId: string | null; roomName: string; children: PresentChild[] }[]; total: number; stale: PresentChild[] }`

- [ ] **Step 1: Write the query**

Group open visits by room, mirroring `getWaitlist` in `src/lib/rooms/queries.ts` — including its handling of children whose room is null or soft-deactivated, which must fall into "Unassigned" rather than vanishing. Flag stale visits with `isStaleVisit`.

- [ ] **Step 2: Build the page**

Reuse `Panel`, `PanelHeader`, `PanelEmpty` from `@/components/ui/panel` and `Pill` from `@/components/ui/pill`. Gate with `verifySession()` and a role branch — staff see their own locations via the RLS policy from Task 1; directors see everything.

- [ ] **Step 3: Add the nav entry**

Add "Who's here" under the existing `Children` section for director/platform_admin, and to the staff branch's `My work` section — staff running a room genuinely need this one.

- [ ] **Step 4: Typecheck, build and commit**

---

### Task 8: Dashboard and checklist

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/dashboard/side-panels.tsx`
- Modify: `src/lib/dashboard/attention.ts` and `attention.test.ts`
- Create: `docs/CHILD-ATTENDANCE-APPLY-CHECKLIST.md`

- [ ] **Step 1: Real presence on the dashboard**

`OccupancyPanel` currently counts enrolled children per room. Switch it to present children, keeping enrolled as the secondary figure — "6 here / 8 enrolled" is more useful than either alone. Add a "Children here" metric to the metric bar.

- [ ] **Step 2: Stale visits as an attention item**

Add a branch to `buildAttentionItems` for stale open visits, severity `warn`, mirroring the existing open-shift branch. Add unit tests alongside the existing 11.

- [ ] **Step 3: Write the apply checklist**

Follow `docs/ROOMS-WAITLIST-APPLY-CHECKLIST.md`'s structure. Cover: the three migrations in order; that `guardian_pins` is unreadable by `authenticated` (a direct select must return zero rows / be refused); that all four RPCs are refused when called as `anon` or `authenticated` and succeed only via the kiosk; the one-open-visit unique index (check a child in twice, confirm one row); the check constraints (an insert with both actors set must fail); and a full door walkthrough — issue a guardian PIN, check in at the kiosk, confirm the child appears on "Who's here" and the dashboard, check out, confirm the visit closes.

- [ ] **Step 4: Typecheck, build, commit**

---

## Self-review notes

**Spec coverage:** `guardian_pins` → Task 1, 2, 6; `child_attendance` visit model → Task 1; kiosk guardian path → Tasks 2, 4, 5; staff override path → Tasks 2, 4, 5; live presence → Task 7; dashboard → Task 8; stale-visit flagging → Tasks 3, 8; audit distinction between guardian-authenticated and staff-vouched → the check constraints in Task 1 plus the actor arguments throughout.

**Deliberately deferred to the second plan:** `child_pickup_authorizations`, parsing the pickup form's JSONB, the code-word UI, and the three-tier enforcement rule. `out_override_reason` and `children.pickup_code_word` are created here so the audit trail and the column are in place from the first check-out, but nothing enforces them yet. Check-out currently records who collected a child without validating them — which is exactly what the paper sheet did, and no worse.

**Known risk to watch during execution:** Task 4 discovers that `kiosk_sessions.profile_id` is `not null`. That migration is listed inside Task 4 rather than Task 1 because it is only discoverable once the guardian session flow is written; if execution reorders these, that migration must still land before Task 4's code.
