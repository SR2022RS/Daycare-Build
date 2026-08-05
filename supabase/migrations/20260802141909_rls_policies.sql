-- RLS helper functions + policies for every table.
-- Pattern: TO authenticated + an explicit tenant/ownership predicate on every policy
-- (never TO authenticated alone -- that's authentication without authorization).

create function public.current_tenant_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create function public.current_role()
returns public.app_role
language sql
stable
security invoker
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.has_location_access(p_location_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and l.tenant_id = public.current_tenant_id()
      and (
        public.current_role() in ('platform_admin', 'director')
        or exists (
          select 1 from public.staff_locations sl
          where sl.staff_id = auth.uid() and sl.location_id = l.id
        )
      )
  );
$$;

-- Prevent a user from self-elevating role or hopping tenant via their own profile UPDATE.
-- Only an existing director/platform_admin may change another profile's role/tenant_id
-- (and even then, only within their own tenant -- enforced by the surrounding RLS policy).
create function public.protect_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.role <> old.role or new.tenant_id <> old.tenant_id)
     and public.current_role() not in ('director', 'platform_admin') then
    new.role := old.role;
    new.tenant_id := old.tenant_id;
  end if;
  return new;
end;
$$;

create trigger protect_profile_privileges_trigger
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ── tenants ──────────────────────────────────────────────────────────────
alter table public.tenants enable row level security;

create policy "tenants_select_own" on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

-- ── profiles ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  );

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── locations ────────────────────────────────────────────────────────────
alter table public.locations enable row level security;

create policy "locations_select" on public.locations
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "locations_write" on public.locations
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

-- ── staff_locations ──────────────────────────────────────────────────────
alter table public.staff_locations enable row level security;

create policy "staff_locations_select" on public.staff_locations
  for select to authenticated
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from public.locations l
      where l.id = staff_locations.location_id
        and l.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

create policy "staff_locations_write" on public.staff_locations
  for all to authenticated
  using (
    exists (
      select 1 from public.locations l
      where l.id = staff_locations.location_id
        and l.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.locations l
      where l.id = staff_locations.location_id
        and l.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

-- ── training_modules ─────────────────────────────────────────────────────
alter table public.training_modules enable row level security;

create policy "training_modules_select" on public.training_modules
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "training_modules_write" on public.training_modules
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

-- ── training_quizzes ─────────────────────────────────────────────────────
alter table public.training_quizzes enable row level security;

create policy "training_quizzes_select" on public.training_quizzes
  for select to authenticated
  using (
    exists (
      select 1 from public.training_modules m
      where m.id = training_quizzes.module_id and m.tenant_id = public.current_tenant_id()
    )
  );

create policy "training_quizzes_write" on public.training_quizzes
  for all to authenticated
  using (
    exists (
      select 1 from public.training_modules m
      where m.id = training_quizzes.module_id
        and m.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.training_modules m
      where m.id = training_quizzes.module_id
        and m.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

-- ── staff_training_progress ──────────────────────────────────────────────
alter table public.staff_training_progress enable row level security;

create policy "staff_training_progress_select" on public.staff_training_progress
  for select to authenticated
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = staff_training_progress.staff_id
        and p.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

create policy "staff_training_progress_write" on public.staff_training_progress
  for all to authenticated
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = staff_training_progress.staff_id
        and p.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  )
  with check (
    staff_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = staff_training_progress.staff_id
        and p.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

-- ── attendance ───────────────────────────────────────────────────────────
alter table public.attendance enable row level security;

create policy "attendance_select" on public.attendance
  for select to authenticated
  using (
    staff_id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  );

create policy "attendance_write" on public.attendance
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      (staff_id = auth.uid() and public.has_location_access(location_id))
      or public.current_role() in ('director', 'platform_admin')
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      (staff_id = auth.uid() and public.has_location_access(location_id))
      or public.current_role() in ('director', 'platform_admin')
    )
  );

-- ── write_ups ────────────────────────────────────────────────────────────
alter table public.write_ups enable row level security;

create policy "write_ups_select" on public.write_ups
  for select to authenticated
  using (
    staff_id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  );

-- Staff never write their own write-ups -- director/platform_admin only.
create policy "write_ups_write" on public.write_ups
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

-- ── policies (the "Policies Library" table) ─────────────────────────────
alter table public.policies enable row level security;

create policy "policies_select" on public.policies
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "policies_write" on public.policies
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));
