-- STEP 11 of 12 — rooms-capacity-and-waitlist
-- Copy everything in this file, paste into the Supabase SQL editor, click Run.
-- Run this ONCE. If it succeeds, never run it again.

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
