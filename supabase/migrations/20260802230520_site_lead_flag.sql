-- Staff Portal foundation, step 1: the "site lead" (alpha staff) flag.
-- Per the spec: site lead is a flag on a staff profile, not a new role in
-- the app_role hierarchy -- it grants two location-scoped powers layered on
-- top of the staff role (incident sign-off queue, arriving with the
-- incident-report feature; and a limited, location-scoped staff directory
-- view, added here since the underlying table already exists).

alter table public.profiles
  add column is_site_lead boolean not null default false;

-- security definer (not invoker): this is called from within profiles' own
-- RLS policy below, and an invoker-rights function would re-trigger that
-- same policy against itself -- infinite recursion (Postgres 54001), the
-- same trap current_tenant_id()/current_role() hit earlier. Kept narrow and
-- safe since it only ever self-scopes via auth.uid().
create function public.current_is_site_lead()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_site_lead from public.profiles where id = auth.uid()), false);
$$;

-- Also security definer: checking whether *another* staffer shares a
-- location with the caller requires reading that staffer's own
-- staff_locations row, which the caller has no RLS visibility into on their
-- own (staff_locations_select only grants staff_id = auth.uid(), or
-- director/platform_admin). An invoker-rights check here would silently
-- evaluate to false for every row but the caller's own.
create function public.shares_location_with(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_locations mine
    join public.staff_locations theirs on theirs.location_id = mine.location_id
    where mine.staff_id = auth.uid()
      and theirs.staff_id = p_staff_id
  );
$$;

-- Site leads get a read-only, location-scoped view of staff who share one of
-- their assigned locations (names/roles only per the spec -- enforced at the
-- query layer since RLS is row-, not column-, scoped). Full-tenant directory
-- access for director/platform_admin is unchanged (see profiles_select).
create policy "profiles_select_site_lead_location" on public.profiles
  for select to authenticated
  using (
    public.current_is_site_lead()
    and tenant_id = public.current_tenant_id()
    and public.shares_location_with(profiles.id)
  );
