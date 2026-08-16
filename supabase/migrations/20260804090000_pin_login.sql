-- Alternate full-portal login via a 4-digit PIN (same power as email+password),
-- for staff who can't reliably receive transactional email yet.
--
-- PIN hashes live in their own table with NO select/insert/update/delete
-- policies for anon/authenticated at all -- only the SECURITY DEFINER
-- functions below (and the service_role admin client) can touch it. This
-- matters more than for a normal password hash: a 4-digit PIN has only
-- 10,000 possible values, so if the hash were ever readable by a client
-- (e.g. via a stray `select("*")` on profiles under the existing
-- profiles_select RLS policy), an offline brute force would take well
-- under a second regardless of bcrypt's cost factor. Keeping it in a
-- policy-less table means RLS denies every client read by default.
create table public.profile_pins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profile_pins enable row level security;

-- Sets or changes the caller's own PIN. SECURITY DEFINER so it can write to
-- profile_pins despite that table having no policies; the auth.uid() check
-- inside the function body is what stands in for RLS here.
-- search_path includes `extensions` because that's where Supabase installs
-- pgcrypto (crypt/gen_salt) by default -- plain `public` won't resolve them.
create function public.set_own_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  insert into public.profile_pins (profile_id, pin_hash)
  values (auth.uid(), crypt(p_pin, gen_salt('bf')))
  on conflict (profile_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now();
end;
$$;

-- `revoke ... from public` alone is not enough: Supabase's default schema
-- privileges grant EXECUTE directly to anon/authenticated/service_role at
-- function-creation time, independent of the PUBLIC pseudo-role, so each
-- unwanted grantee needs an explicit revoke.
revoke all on function public.set_own_pin(text) from public, anon;
grant execute on function public.set_own_pin(text) to authenticated;

-- Verifies email+PIN for the pre-auth login flow. Only ever called by the
-- server via the service_role admin client -- never exposed to anon or
-- authenticated -- since the caller has no session yet to check auth.uid()
-- against. `for update` locks the profile_pins row for the transaction so
-- concurrent guesses against the same account serialize through the
-- lockout counter instead of racing past it.
-- Lockout: 5 wrong PINs locks the account for 15 minutes. At a 10,000-PIN
-- keyspace that's ~2000 lockout cycles minimum to exhaust by brute force --
-- weeks, not seconds -- which is the real defense here, not bcrypt's cost.
create function public.verify_pin(p_email text, p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile_id uuid;
  v_pin record;
  v_new_attempts int;
begin
  select id into v_profile_id from public.profiles where email = p_email;
  if v_profile_id is null then
    return null;
  end if;

  select pin_hash, failed_attempts, locked_until into v_pin
  from public.profile_pins
  where profile_id = v_profile_id
  for update;

  if not found then
    return null;
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return null;
  end if;

  if p_pin !~ '^[0-9]{4}$' then
    return null;
  end if;

  if crypt(p_pin, v_pin.pin_hash) = v_pin.pin_hash then
    update public.profile_pins
    set failed_attempts = 0, locked_until = null, updated_at = now()
    where profile_id = v_profile_id;
    return v_profile_id;
  end if;

  v_new_attempts := v_pin.failed_attempts + 1;

  if v_new_attempts >= 5 then
    update public.profile_pins
    set failed_attempts = 0, locked_until = now() + interval '15 minutes', updated_at = now()
    where profile_id = v_profile_id;
  else
    update public.profile_pins
    set failed_attempts = v_new_attempts, updated_at = now()
    where profile_id = v_profile_id;
  end if;

  return null;
end;
$$;

revoke all on function public.verify_pin(text, text) from public, anon, authenticated;
grant execute on function public.verify_pin(text, text) to service_role;

-- Lets a user (or a director rendering a staff list later) know whether a
-- PIN is set without ever exposing the hash itself.
create function public.has_own_pin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_pins where profile_id = auth.uid()
  );
$$;

revoke all on function public.has_own_pin() from public, anon;
grant execute on function public.has_own_pin() to authenticated;
