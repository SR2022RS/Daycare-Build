-- Org calendar / closure days (AKPA-Portal-Seed-Data.md Sec.3). Real
-- closure-date rows are seeded separately in supabase/onetime/ -- this
-- migration is schema only.

create table public.org_calendar (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index org_calendar_tenant_id_idx on public.org_calendar (tenant_id);

alter table public.org_calendar enable row level security;

create policy "org_calendar_select" on public.org_calendar
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "org_calendar_write" on public.org_calendar
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));
