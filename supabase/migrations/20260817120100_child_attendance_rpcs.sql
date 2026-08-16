-- Kiosk RPCs for guardian PIN and child check-in/out. Mirrors
-- admin_set_staff_pin / kiosk_identify_pin from 20260813090000 exactly:
-- same lockout shape, same PIN regex gate, same candidate-loop-with-crypt
-- pattern, same revoke/grant lines. No RPC in this codebase is granted to
-- anon, and these are no exception -- the unauthenticated kiosk reaches
-- them only through the device_token in the URL plus a service-role admin
-- client inside a "use server" action.

-- ── admin_set_guardian_pin: director assigns/resets a guardian's kiosk
-- PIN. Same shape as admin_set_staff_pin -- the caller (a director-only
-- server action) generates the plaintext PIN and displays it once; this
-- function only ever hashes and stores it, and enforces tenant-wide
-- uniqueness so the kiosk can identify a guardian by PIN alone. ─────────
create function public.admin_set_guardian_pin(p_guardian_id uuid, p_pin text)
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

  select tenant_id into v_target_tenant from public.guardians where id = p_guardian_id;
  if v_target_tenant is null or v_target_tenant <> v_tenant_id then
    raise exception 'not authorized';
  end if;

  select exists (
    select 1
    from public.guardian_pins gp
    where gp.tenant_id = v_tenant_id
      and gp.guardian_id <> p_guardian_id
      and crypt(p_pin, gp.pin_hash) = gp.pin_hash
  ) into v_collision;

  if v_collision then
    raise exception 'pin_taken';
  end if;

  insert into public.guardian_pins (guardian_id, tenant_id, pin_hash)
  values (p_guardian_id, v_tenant_id, crypt(p_pin, gen_salt('bf')))
  on conflict (guardian_id) do update
    set pin_hash = excluded.pin_hash,
        tenant_id = excluded.tenant_id,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now();
end;
$$;

revoke all on function public.admin_set_guardian_pin(uuid, text) from public, anon;
grant execute on function public.admin_set_guardian_pin(uuid, text) to authenticated;

-- ── kiosk_identify_guardian_pin: identifies a guardian at a kiosk by PIN
-- alone, same device-scoped lockout as kiosk_identify_pin (a wrong PIN
-- doesn't reveal who it was meant for, so rate-limiting the terminal is
-- the only sane defense). The one structural difference: staff are scoped
-- by staff_locations, but guardians have no location link at all, so the
-- candidate loop scopes by tenant PLUS having at least one active child at
-- the device's location. Without that second clause this function would be
-- a tenant-wide PIN oracle -- any guess would eventually match someone,
-- just not necessarily a family with a child at this building.
-- service_role only, called from kiosk server actions with no session. ──
create function public.kiosk_identify_guardian_pin(p_device_token uuid, p_pin text)
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
    if crypt(p_pin, r.pin_hash) = r.pin_hash then
      v_match := r.guardian_id;
      exit;
    end if;
  end loop;

  if v_match is not null then
    update public.kiosk_devices
    set failed_attempts = 0, locked_until = null
    where id = v_device.id;

    insert into public.kiosk_pin_attempts (device_id, guardian_id, outcome)
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

revoke all on function public.kiosk_identify_guardian_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.kiosk_identify_guardian_pin(uuid, text) to service_role;

-- ── kiosk_check_child_in: records a visit start. Idempotent by design --
-- a second tap (double-tap, flaky network retry) hits the partial unique
-- index on open visits and this function turns it into a no-op instead of
-- an error, returning the existing visit's id unchanged. Exactly one of
-- guardian/staff must vouch for the child, same rule the table's own
-- child_attendance_in_actor constraint enforces -- checked here first so
-- the kiosk gets a readable error instead of a raw constraint violation.
-- No extensions needed (no crypto in this function), unlike the PIN
-- functions above. service_role only. ────────────────────────────────────
create function public.kiosk_check_child_in(p_child_id uuid, p_room_id uuid, p_guardian_id uuid, p_staff_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child record;
  v_room_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
begin
  if num_nonnulls(p_guardian_id, p_staff_id) <> 1 then
    raise exception 'exactly one of guardian or staff must check the child in';
  end if;

  select id, tenant_id, location_id, room_id, status
  into v_child
  from public.children
  where id = p_child_id;

  if not found or v_child.status <> 'active' then
    raise exception 'child not active';
  end if;

  v_room_id := coalesce(p_room_id, v_child.room_id);

  select id into v_existing_id
  from public.child_attendance
  where child_id = p_child_id and checked_out_at is null;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.child_attendance (
    tenant_id, location_id, child_id, room_id, in_by_guardian_id, in_by_staff_id
  ) values (
    v_child.tenant_id, v_child.location_id, p_child_id, v_room_id, p_guardian_id, p_staff_id
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.kiosk_check_child_in(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.kiosk_check_child_in(uuid, uuid, uuid, uuid) to service_role;

-- ── kiosk_check_child_out: closes the open visit. `for update` locks the
-- open-visit row for the transaction so two concurrent check-out taps
-- can't both succeed against the same visit -- the second sees the row
-- already closed and hits no_open_visit instead of racing past it, same
-- reasoning as the `for update` on kiosk_devices above. Raises a
-- distinguishable no_open_visit exception (rather than silently no-op'ing)
-- because, unlike check-in, a phantom checkout is a parent-facing error
-- worth surfacing, not a retry to swallow. service_role only. ───────────
create function public.kiosk_check_child_out(p_child_id uuid, p_guardian_id uuid, p_staff_id uuid, p_override_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit_id uuid;
begin
  if num_nonnulls(p_guardian_id, p_staff_id) <> 1 then
    raise exception 'exactly one of guardian or staff must check the child out';
  end if;

  select id into v_visit_id
  from public.child_attendance
  where child_id = p_child_id and checked_out_at is null
  for update;

  if v_visit_id is null then
    raise exception 'no_open_visit';
  end if;

  update public.child_attendance
  set checked_out_at = now(),
      out_by_guardian_id = p_guardian_id,
      out_by_staff_id = p_staff_id,
      out_override_reason = p_override_reason
  where id = v_visit_id;

  return v_visit_id;
end;
$$;

revoke all on function public.kiosk_check_child_out(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.kiosk_check_child_out(uuid, uuid, uuid, text) to service_role;
