-- Staff Portal T3 (incident reports) + T7 (SOPs library).
-- Both ship structure now; incident report photo attachments and SOP
-- content/attachments arrive later (no Storage bucket wired yet -- content
-- comes from Kira per the spec).

create type public.incident_status as enum ('filed', 'signed', 'parent_notified');

create table public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  filed_by uuid not null references public.profiles (id),
  -- Free-text until the children module wires a real picker (per spec);
  -- child_id is nullable now so a real link can be added without a new column later.
  child_name text not null,
  child_id uuid references public.children (id) on delete set null,
  what_happened text not null,
  action_taken text not null,
  photo_url text,
  status public.incident_status not null default 'filed',
  signed_by uuid references public.profiles (id),
  signed_at timestamptz,
  parent_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index incident_reports_tenant_id_idx on public.incident_reports (tenant_id);
create index incident_reports_location_id_idx on public.incident_reports (location_id);
create index incident_reports_filed_by_idx on public.incident_reports (filed_by);

alter table public.incident_reports enable row level security;

-- Author sees their own; site leads see (and sign off) reports at a location
-- they're assigned to; director/platform_admin see everything in tenant.
create policy "incident_reports_select" on public.incident_reports
  for select to authenticated
  using (
    filed_by = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
    or (
      public.current_is_site_lead()
      and exists (
        select 1 from public.staff_locations sl
        where sl.staff_id = auth.uid() and sl.location_id = incident_reports.location_id
      )
    )
  );

-- Any staffer can file (insert) a report for a location they're assigned to.
create policy "incident_reports_insert" on public.incident_reports
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and filed_by = auth.uid()
    and public.has_location_access(location_id)
  );

-- Sign-off / status updates: site lead at that location, or director/admin.
-- Authors cannot edit their own filed report (no self-certification, same
-- pattern as write_ups/credentials).
create policy "incident_reports_update" on public.incident_reports
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or (
        public.current_is_site_lead()
        and exists (
          select 1 from public.staff_locations sl
          where sl.staff_id = auth.uid() and sl.location_id = incident_reports.location_id
        )
      )
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or (
        public.current_is_site_lead()
        and exists (
          select 1 from public.staff_locations sl
          where sl.staff_id = auth.uid() and sl.location_id = incident_reports.location_id
        )
      )
    )
  );

-- ── SOPs library (T7) ────────────────────────────────────────────────────

create type public.sop_audience as enum ('all', 'staff', 'site_lead');

create table public.sops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  category text not null,
  audience public.sop_audience not null default 'all',
  content text,
  version text not null default '1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sops_tenant_id_idx on public.sops (tenant_id);

alter table public.sops enable row level security;

-- Read scope mirrors the matrix: staff see 'all' + 'staff'; site leads add
-- 'site_lead'; director/platform_admin see everything.
create policy "sops_select" on public.sops
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or audience = 'all'
      or (audience = 'staff')
      or (audience = 'site_lead' and public.current_is_site_lead())
    )
  );

create policy "sops_write" on public.sops
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));
