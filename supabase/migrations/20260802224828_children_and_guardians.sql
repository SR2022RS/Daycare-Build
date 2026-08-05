-- Money Module Step 2: children + guardians core data model.
-- Foundation for the charges/payments engine and revenue dashboard (Steps 3-5) --
-- same tables get extended later, per the spec ("do not fork").
-- Director/platform_admin only for now: no staff-facing screens read this data yet.

create type public.child_status as enum ('active', 'waitlisted', 'inactive');
create type public.funding_type as enum ('private', '4cs', 'mixed');
create type public.child_schedule as enum ('full_time', 'part_time');
create type public.billing_cadence as enum ('weekly', 'biweekly', 'monthly');

create table public.children (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  full_name text not null,
  dob date not null,
  classroom text,
  status public.child_status not null default 'active',
  funding_type public.funding_type not null default 'private',
  schedule public.child_schedule not null default 'full_time',
  weekly_rate numeric(10, 2),
  rate_note text,
  cadence public.billing_cadence not null default 'weekly',
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index children_tenant_id_idx on public.children (tenant_id);
create index children_location_id_idx on public.children (location_id);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create index guardians_tenant_id_idx on public.guardians (tenant_id);

-- Many-to-many: a child can have more than one guardian, a guardian more than one child
-- (siblings). is_payer marks which guardian(s) the family balance is billed to.
create table public.child_guardians (
  child_id uuid not null references public.children (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  relationship text,
  is_payer boolean not null default false,
  primary key (child_id, guardian_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.children enable row level security;

create policy "children_select" on public.children
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "children_write" on public.children
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

alter table public.guardians enable row level security;

create policy "guardians_select" on public.guardians
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "guardians_write" on public.guardians
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

alter table public.child_guardians enable row level security;

create policy "child_guardians_select" on public.child_guardians
  for select to authenticated
  using (
    exists (
      select 1 from public.children c
      where c.id = child_guardians.child_id
        and c.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

create policy "child_guardians_write" on public.child_guardians
  for all to authenticated
  using (
    exists (
      select 1 from public.children c
      where c.id = child_guardians.child_id
        and c.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.children c
      where c.id = child_guardians.child_id
        and c.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );
