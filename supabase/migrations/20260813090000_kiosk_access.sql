-- Kiosk & PIN access model (spec §7, 2026-08-12): PIN moves from a
-- full-portal login (same power as a password) to a kiosk-only time clock.
-- "A PIN alone never opens [the personal portal]" -- so this migration
-- removes the old full-session PIN login entirely and replaces it with a
-- device-scoped identify flow that only ever authorizes clock/incident
-- writes, never a Supabase auth session.

-- ── profile_pins: add tenant scoping ────────────────────────────────────
-- Needed so a kiosk can enforce "PIN unique per tenant" (a kiosk identifies
-- staff by PIN alone, with no email/username, so two staff in the same
-- tenant can never share a PIN) and so RLS-less admin functions can scope
-- their uniqueness check without joining through profiles every time.
alter table public.profile_pins add column tenant_id uuid references public.tenants (id) on delete cascade;

update public.profile_pins pp
set tenant_id = p.tenant_id
from public.profiles p
where pp.profile_id = p.id;

alter table public.profile_pins alter column tenant_id set not null;

create index profile_pins_tenant_id_idx on public.profile_pins (tenant_id);

-- Old full-login PIN path -- staff self-set a PIN that minted a real
-- session with full portal access. Retired per spec §7.
drop function if exists public.verify_pin(text, text);
drop function if exists public.set_own_pin(text);
drop function if exists public.has_own_pin();

-- ── rooms (per-location, for kiosk room-transfer) ───────────────────────
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index rooms_location_id_idx on public.rooms (location_id);

alter table public.rooms enable row level security;

create policy "rooms_select" on public.rooms
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "rooms_write" on public.rooms
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

-- ── kiosk_devices (one row per physical tablet, registered to a location) ─
create table public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  device_token uuid not null default gen_random_uuid() unique,
  is_active boolean not null default true,
  -- Lockout is scoped to the DEVICE, not a staff account -- see
  -- kiosk_identify_pin() below for why.
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index kiosk_devices_location_id_idx on public.kiosk_devices (location_id);

alter table public.kiosk_devices enable row level security;

-- Directors manage devices from Settings (authenticated session). The
-- public /kiosk/[deviceToken] page reads this table through the admin
-- client instead (same trust model as /forms/fill's token lookup) --
-- RLS denies every anon/authenticated client read by default, which is
-- exactly right here.
create policy "kiosk_devices_select" on public.kiosk_devices
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "kiosk_devices_write" on public.kiosk_devices
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

-- ── kiosk_sessions (short-lived bridge between "PIN verified" and "which
-- action to perform" -- never a Supabase auth session) ──────────────────
create table public.kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.kiosk_devices (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  created_at timestamptz not null default now()
);

create index kiosk_sessions_expires_at_idx on public.kiosk_sessions (expires_at);

-- No client-facing policies at all -- only the admin client (server
-- actions) ever reads or writes this table, same pattern as profile_pins.
alter table public.kiosk_sessions enable row level security;

-- ── kiosk_pin_attempts (audit trail, every entry) ───────────────────────
create type public.kiosk_pin_outcome as enum ('success', 'invalid_pin', 'locked');

create table public.kiosk_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.kiosk_devices (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  outcome public.kiosk_pin_outcome not null,
  created_at timestamptz not null default now()
);

create index kiosk_pin_attempts_device_id_idx on public.kiosk_pin_attempts (device_id, created_at desc);

alter table public.kiosk_pin_attempts enable row level security;

create policy "kiosk_pin_attempts_select" on public.kiosk_pin_attempts
  for select to authenticated
  using (
    exists (
      select 1 from public.kiosk_devices kd
      where kd.id = kiosk_pin_attempts.device_id
        and kd.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

-- ── attendance_breaks ────────────────────────────────────────────────────
create table public.attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index attendance_breaks_attendance_id_idx on public.attendance_breaks (attendance_id);

alter table public.attendance_breaks enable row level security;

create policy "attendance_breaks_select" on public.attendance_breaks
  for select to authenticated
  using (
    exists (
      select 1 from public.attendance a
      where a.id = attendance_breaks.attendance_id
        and (
          a.staff_id = auth.uid()
          or (a.tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
        )
    )
  );

-- ── room_transfers (history, not just "current room") ───────────────────
create table public.room_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  staff_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  transferred_at timestamptz not null default now()
);

create index room_transfers_staff_id_idx on public.room_transfers (staff_id, transferred_at desc);

alter table public.room_transfers enable row level security;

create policy "room_transfers_select" on public.room_transfers
  for select to authenticated
  using (
    staff_id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  );

-- ── attendance.source: add 'kiosk' alongside web/mobile/admin ───────────
alter table public.attendance drop constraint attendance_source_check;
alter table public.attendance add constraint attendance_source_check
  check (source in ('web', 'mobile', 'admin', 'kiosk'));

-- ── admin_set_staff_pin: director assigns/resets a staff member's kiosk
-- PIN. Caller (a director-only server action) generates the plaintext PIN
-- itself and displays it once -- this function only ever hashes and
-- stores it, and enforces tenant-wide uniqueness so a kiosk can identify
-- staff by PIN alone. ────────────────────────────────────────────────────
create function public.admin_set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant_id uuid;
  v_target_tenant uuid;
  v_collision boolean;
begin
  if public.current_role() not in ('director', 'platform_admin') then
    raise exception 'not authorized';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  v_tenant_id := public.current_tenant_id();

  select tenant_id into v_target_tenant from public.profiles where id = p_staff_id;
  if v_target_tenant is null or v_target_tenant <> v_tenant_id then
    raise exception 'not authorized';
  end if;

  select exists (
    select 1
    from public.profile_pins pp
    where pp.tenant_id = v_tenant_id
      and pp.profile_id <> p_staff_id
      and crypt(p_pin, pp.pin_hash) = pp.pin_hash
  ) into v_collision;

  if v_collision then
    raise exception 'pin_taken';
  end if;

  insert into public.profile_pins (profile_id, tenant_id, pin_hash)
  values (p_staff_id, v_tenant_id, crypt(p_pin, gen_salt('bf')))
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash,
        tenant_id = excluded.tenant_id,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now();
end;
$$;

revoke all on function public.admin_set_staff_pin(uuid, text) from public, anon;
grant execute on function public.admin_set_staff_pin(uuid, text) to authenticated;

-- ── kiosk_identify_pin: identifies staff at a kiosk by PIN alone (no
-- email -- the device is shared). Lockout is scoped to the DEVICE: a wrong
-- PIN doesn't reveal who it might have "meant to be", so the only sane
-- brute-force defense is rate-limiting the terminal itself, not an
-- individual account. 5 wrong PINs locks that kiosk for 15 minutes --
-- service_role only, called from kiosk server actions with no session. ──
create function public.kiosk_identify_pin(p_device_token uuid, p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device record;
  v_match uuid;
  r record;
  v_new_attempts int;
begin
  select id, tenant_id, location_id, is_active, failed_attempts, locked_until
  into v_device
  from public.kiosk_devices
  where device_token = p_device_token
  for update;

  if not found or not v_device.is_active then
    return null;
  end if;

  if v_device.locked_until is not null and v_device.locked_until > now() then
    return null;
  end if;

  update public.kiosk_devices set last_seen_at = now() where id = v_device.id;

  if p_pin !~ '^[0-9]{4,6}$' then
    return null;
  end if;

  for r in (
    select pp.profile_id, pp.pin_hash
    from public.profile_pins pp
    join public.staff_locations sl on sl.staff_id = pp.profile_id
    where sl.location_id = v_device.location_id
      and pp.tenant_id = v_device.tenant_id
  ) loop
    if crypt(p_pin, r.pin_hash) = r.pin_hash then
      v_match := r.profile_id;
      exit;
    end if;
  end loop;

  if v_match is not null then
    update public.kiosk_devices
    set failed_attempts = 0, locked_until = null
    where id = v_device.id;

    insert into public.kiosk_pin_attempts (device_id, profile_id, outcome)
    values (v_device.id, v_match, 'success');

    return v_match;
  end if;

  v_new_attempts := v_device.failed_attempts + 1;

  if v_new_attempts >= 5 then
    update public.kiosk_devices
    set failed_attempts = 0, locked_until = now() + interval '15 minutes'
    where id = v_device.id;
    insert into public.kiosk_pin_attempts (device_id, outcome) values (v_device.id, 'locked');
  else
    update public.kiosk_devices set failed_attempts = v_new_attempts where id = v_device.id;
    insert into public.kiosk_pin_attempts (device_id, outcome) values (v_device.id, 'invalid_pin');
  end if;

  return null;
end;
$$;

revoke all on function public.kiosk_identify_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.kiosk_identify_pin(uuid, text) to service_role;
