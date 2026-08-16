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
