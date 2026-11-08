-- Separates guardian PIN lockout from staff PIN lockout at the kiosk.
--
-- kiosk_identify_guardian_pin originally reused kiosk_devices.failed_attempts
-- / locked_until -- the same counter kiosk_identify_pin uses for staff. That
-- meant five fumbled parent PINs during morning drop-off would lock the
-- terminal for 15 minutes and stop staff from clocking in. Parents fumbling
-- a 4-digit PIN while juggling a car seat and a toddler at 8am is the normal
-- case, not the abuse case, and it should not be able to lock out staff.
--
-- Same 5-strike / 15-minute policy, same per-device scope (a wrong PIN still
-- doesn't reveal who it was meant for, so the terminal is still the right
-- thing to rate-limit) -- just a second, independent counter.

alter table public.kiosk_devices
  add column guardian_failed_attempts int not null default 0,
  add column guardian_locked_until timestamptz;

-- ── kiosk_identify_guardian_pin: replaces the version from
-- 20260817120100_child_attendance_rpcs.sql. Identical in every other
-- respect (device lookup, `for update` lock, PIN regex gate, tenant +
-- active-child-at-location candidate scoping, crypt loop, attempt
-- logging) -- only the lockout counters change, from the shared
-- failed_attempts/locked_until to the guardian-only pair added above. ──
create or replace function public.kiosk_identify_guardian_pin(p_device_token uuid, p_pin text)
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
  select id, tenant_id, location_id, is_active, guardian_failed_attempts, guardian_locked_until
  into v_device
  from public.kiosk_devices
  where device_token = p_device_token
  for update;

  if not found or not v_device.is_active then
    return null;
  end if;

  if v_device.guardian_locked_until is not null and v_device.guardian_locked_until > now() then
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
    set guardian_failed_attempts = 0, guardian_locked_until = null
    where id = v_device.id;

    insert into public.kiosk_pin_attempts (device_id, guardian_id, outcome)
    values (v_device.id, v_match, 'success');

    return v_match;
  end if;

  v_new_attempts := v_device.guardian_failed_attempts + 1;

  if v_new_attempts >= 5 then
    update public.kiosk_devices
    set guardian_failed_attempts = 0, guardian_locked_until = now() + interval '15 minutes'
    where id = v_device.id;
    insert into public.kiosk_pin_attempts (device_id, outcome) values (v_device.id, 'locked');
  else
    update public.kiosk_devices set guardian_failed_attempts = v_new_attempts where id = v_device.id;
    insert into public.kiosk_pin_attempts (device_id, outcome) values (v_device.id, 'invalid_pin');
  end if;

  return null;
end;
$$;

-- Re-asserted rather than assumed carried over: create or replace does not
-- touch grants, but this makes the function's access shape self-evident
-- from this migration alone, matching the rest of the kiosk RPC family.
revoke all on function public.kiosk_identify_guardian_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.kiosk_identify_guardian_pin(uuid, text) to service_role;
