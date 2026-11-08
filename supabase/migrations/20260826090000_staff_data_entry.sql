-- Let employees load the portal themselves, without showing them the money.
--
-- The requirement: staff enter people (children, parents, contacts, pickup
-- lists, rooms); directors alone decide rates.
--
-- The obvious implementation -- adding 'staff' to the children/guardians RLS
-- policies -- is WRONG, and deliberately not what this does. RLS grants or
-- denies whole rows, so it cannot say "these columns but not those". Widening
-- those policies would hand staff `weekly_rate` and `subsidy_weekly_amount`
-- along with everything else, reversing the ruling recorded in
-- 20260814120400_child_roster_view.sql, where staff were kept off the
-- `children` table precisely so they could see that a family is overdue
-- without seeing what that family pays.
--
-- So instead:
--   READ   staff read `child_people`, a definer view carrying the people
--          columns and no money at all.
--   WRITE  staff write through SECURITY DEFINER functions that accept only
--          people columns, so there is no field for a rate to travel in.
--   TABLE  `children` and `guardians` RLS stays director-only, untouched.
--
-- Tables with no money on them -- child_contacts, rooms -- are plain RLS,
-- because there is nothing on them to protect this way.
--
-- Every statement is idempotent so this can be re-run safely.

-- ── child_people ─────────────────────────────────────────────────────────
-- What staff need to do their job and enter data, minus every dollar figure.
-- security_invoker = false so it runs as the definer and staff can read it
-- despite the children table itself being closed to them; the tenant filter
-- inside is therefore load-bearing, exactly as in child_balance_status.
create or replace view public.child_people
with (security_invoker = false)
as
select
  c.id as child_id,
  c.tenant_id,
  c.full_name,
  c.dob,
  c.classroom,
  c.status,
  c.schedule,
  c.funding_type,
  c.start_date,
  c.desired_start_date,
  c.waitlisted_at,
  c.pickup_code_word,
  c.location_id,
  c.room_id,
  l.name as location_name,
  r.name as room_name
from public.children c
left join public.locations l on l.id = c.location_id
left join public.rooms r on r.id = c.room_id
where c.tenant_id = public.current_tenant_id();

alter view public.child_people set (security_barrier = true);

-- Supabase grants SELECT to anon/authenticated at object-creation time, so
-- revoking from PUBLIC alone leaves those grants in place. Revoke each.
revoke all on public.child_people from public;
revoke all on public.child_people from anon;
revoke all on public.child_people from authenticated;
grant select on public.child_people to authenticated;

-- ── staff_save_child ─────────────────────────────────────────────────────
-- The only way staff may create or edit a child.
--
-- There is no rate parameter. That is the whole design: a teacher cannot set
-- a price through this function because the function has nowhere to put one,
-- which is a stronger guarantee than remembering to strip a form field.
create or replace function public.staff_save_child(
  p_child_id uuid,
  p_full_name text,
  p_dob date,
  p_location_id uuid,
  p_classroom text default null,
  p_status public.child_status default 'active',
  p_schedule public.child_schedule default 'full_time',
  p_funding_type public.funding_type default 'private',
  p_start_date date default null,
  p_desired_start_date date default null,
  p_pickup_code_word text default null,
  p_room_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role public.app_role := public.current_role();
  v_id uuid;
begin
  if v_tenant is null or v_role not in ('director', 'platform_admin', 'staff') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'a child needs a name' using errcode = 'check_violation';
  end if;

  -- The location and room are ids from a form. Both must belong to this
  -- tenant or a crafted call could file a child under another centre.
  if p_location_id is null or not exists (
    select 1 from public.locations
    where id = p_location_id and tenant_id = v_tenant
  ) then
    raise exception 'unknown campus' using errcode = 'foreign_key_violation';
  end if;

  if p_room_id is not null and not exists (
    select 1 from public.rooms
    where id = p_room_id and tenant_id = v_tenant
  ) then
    raise exception 'unknown room' using errcode = 'foreign_key_violation';
  end if;

  if p_child_id is null then
    insert into public.children (
      tenant_id, location_id, full_name, dob, classroom, status, schedule,
      funding_type, start_date, desired_start_date, pickup_code_word, room_id
    )
    values (
      v_tenant, p_location_id, btrim(p_full_name), p_dob, p_classroom, p_status,
      p_schedule, p_funding_type, p_start_date, p_desired_start_date,
      p_pickup_code_word, p_room_id
    )
    returning id into v_id;
  else
    update public.children set
      location_id = p_location_id,
      full_name = btrim(p_full_name),
      dob = p_dob,
      classroom = p_classroom,
      status = p_status,
      schedule = p_schedule,
      funding_type = p_funding_type,
      start_date = p_start_date,
      desired_start_date = p_desired_start_date,
      pickup_code_word = p_pickup_code_word,
      room_id = p_room_id,
      updated_at = now()
    where id = p_child_id and tenant_id = v_tenant
    returning id into v_id;

    if v_id is null then
      raise exception 'child not found' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.staff_save_child(
  uuid, text, date, uuid, text, public.child_status, public.child_schedule,
  public.funding_type, date, date, text, uuid
) from public, anon;
grant execute on function public.staff_save_child(
  uuid, text, date, uuid, text, public.child_status, public.child_schedule,
  public.funding_type, date, date, text, uuid
) to authenticated;

-- ── staff_link_guardian ──────────────────────────────────────────────────
-- Adds a parent and links them to a child, reusing the parent if we already
-- have them. A mother with three children must be ONE record: otherwise
-- correcting her phone number means finding every copy, and the invoice, the
-- text blast and the pickup list can each end up pointing at a different one.
--
-- Matching is by email, then by the last 10 digits of the phone so that
-- "(973) 555-0100" and "+19735550100" are recognised as the same person.
-- Never by name -- two children called Smith do not share a mother, and
-- silently merging two families is far worse than a duplicate.
create or replace function public.staff_link_guardian(
  p_child_id uuid,
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_relationship text default null,
  p_is_payer boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role public.app_role := public.current_role();
  v_guardian uuid;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if v_tenant is null or v_role not in ('director', 'platform_admin', 'staff') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'a parent needs a name' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.children
    where id = p_child_id and tenant_id = v_tenant
  ) then
    raise exception 'child not found' using errcode = 'no_data_found';
  end if;

  if p_email is not null and btrim(p_email) <> '' then
    select id into v_guardian
    from public.guardians
    where tenant_id = v_tenant and lower(email) = lower(btrim(p_email))
    limit 1;
  end if;

  if v_guardian is null and length(v_digits) >= 10 then
    select id into v_guardian
    from public.guardians
    where tenant_id = v_tenant
      and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = right(v_digits, 10)
    limit 1;
  end if;

  if v_guardian is null then
    insert into public.guardians (tenant_id, full_name, phone, email)
    values (v_tenant, btrim(p_full_name), nullif(btrim(coalesce(p_phone, '')), ''),
            nullif(btrim(coalesce(p_email, '')), ''))
    returning id into v_guardian;
  else
    -- Fill gaps, never blank out something already recorded with an empty
    -- field from this form.
    update public.guardians set
      phone = coalesce(nullif(btrim(coalesce(p_phone, '')), ''), phone),
      email = coalesce(nullif(btrim(coalesce(p_email, '')), ''), email)
    where id = v_guardian;
  end if;

  insert into public.child_guardians (child_id, guardian_id, relationship, is_payer)
  values (p_child_id, v_guardian, p_relationship, coalesce(p_is_payer, false))
  on conflict (child_id, guardian_id) do update
    set relationship = excluded.relationship,
        is_payer = excluded.is_payer;

  -- One payer per child, same rule the director path enforces.
  if coalesce(p_is_payer, false) then
    update public.child_guardians
    set is_payer = false
    where child_id = p_child_id and guardian_id <> v_guardian;
  end if;

  return v_guardian;
end;
$$;

revoke all on function public.staff_link_guardian(uuid, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.staff_link_guardian(uuid, text, text, text, text, boolean)
  to authenticated;

-- ── guardians, read-only for staff ───────────────────────────────────────
-- Staff need to see who they just added, and who to call. Guardians carry no
-- money, so a view is enough; writes still go through staff_link_guardian.
create or replace view public.child_guardian_people
with (security_invoker = false)
as
select
  cg.child_id,
  g.id as guardian_id,
  g.tenant_id,
  g.full_name,
  g.phone,
  g.email,
  cg.relationship,
  cg.is_payer
from public.child_guardians cg
join public.guardians g on g.id = cg.guardian_id
where g.tenant_id = public.current_tenant_id();

alter view public.child_guardian_people set (security_barrier = true);
revoke all on public.child_guardian_people from public;
revoke all on public.child_guardian_people from anon;
revoke all on public.child_guardian_people from authenticated;
grant select on public.child_guardian_people to authenticated;

-- ── money guard ──────────────────────────────────────────────────────────
-- Defence in depth for the director path, which still writes the table
-- directly. If a rate field ever reaches an update it should not, this
-- refuses rather than silently accepting it.
--
-- auth.uid() is null for the service-role client -- the webhook, kiosk and
-- billing jobs -- which must keep working, so the guard applies only to a
-- real logged-in user.
create or replace function public.guard_child_money()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_role() in ('director', 'platform_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.weekly_rate := null;
    new.subsidy_weekly_amount := null;
    new.rate_note := null;
    return new;
  end if;

  if new.weekly_rate is distinct from old.weekly_rate
     or new.subsidy_weekly_amount is distinct from old.subsidy_weekly_amount
     or new.rate_note is distinct from old.rate_note then
    raise exception 'Only a director can change a child''s rates'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_child_money on public.children;
create trigger guard_child_money
  before insert or update on public.children
  for each row execute function public.guard_child_money();

-- ── rooms ────────────────────────────────────────────────────────────────
-- No money on this table, so plain RLS. There was previously no way to create
-- a room at all -- not in the UI, not in an action -- which is why the tenant
-- has five campuses and zero classrooms, and why the portal cannot yet tell
-- anyone that a room is full.
drop policy if exists "rooms_write" on public.rooms;
create policy "rooms_write" on public.rooms
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin', 'staff')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin', 'staff')
  );

-- ── child_contacts ───────────────────────────────────────────────────────
-- Emergency contacts and the pickup lists, which had nowhere to live at all
-- while being exactly what a centre is asked for at the worst moment.
--
-- One table with a `kind` rather than three: identical fields, always read
-- together, and "may not collect this child" is the same shape of fact as
-- "may". No money here either, so plain RLS open to staff.
create table if not exists public.child_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,

  kind text not null check (kind in ('emergency', 'pickup_allowed', 'pickup_denied')),

  full_name text not null,
  relationship text,
  phone text,

  -- Free text, and load-bearing: this is where "court order on file, do not
  -- release" gets written. Shown in full at the kiosk.
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists child_contacts_child_idx
  on public.child_contacts (child_id, kind);

alter table public.child_contacts enable row level security;

drop policy if exists "child_contacts_select" on public.child_contacts;
create policy "child_contacts_select" on public.child_contacts
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin', 'staff')
  );

drop policy if exists "child_contacts_write" on public.child_contacts;
create policy "child_contacts_write" on public.child_contacts
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin', 'staff')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin', 'staff')
  );

drop trigger if exists set_child_contacts_updated_at on public.child_contacts;
create trigger set_child_contacts_updated_at
  before update on public.child_contacts
  for each row execute function public.set_updated_at();
