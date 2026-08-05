-- Money Module Sec.1: extend attendance into a real timecard source (source,
-- note, edit-audit trail), plus a per-staff per-week approval record. This
-- extends the existing attendance table rather than adding a parallel
-- time_entries table -- same shape (staff_id, location_id, clock_in_at,
-- clock_out_at) the spec describes, already wired into every attendance UI.
--
-- Pay period: weekly, Monday-Sunday (client-confirmed). Overtime = hours
-- over 40 within that window, computed in the app layer, not stored.

alter table public.attendance
  add column source text not null default 'web' check (source in ('web', 'mobile', 'admin')),
  add column note text,
  add column edited_by uuid references public.profiles (id),
  add column edited_at timestamptz,
  -- Populated only on first edit, so the true original survives repeat
  -- corrections -- never overwritten once set.
  add column original_clock_in_at timestamptz,
  add column original_clock_out_at timestamptz;

create table public.timecard_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  staff_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null, -- always a Monday
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (staff_id, week_start)
);

create index timecard_approvals_tenant_id_idx on public.timecard_approvals (tenant_id);

alter table public.timecard_approvals enable row level security;

create policy "timecard_approvals_select" on public.timecard_approvals
  for select to authenticated
  using (
    staff_id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  );

-- Staff never approve their own timecard -- director/platform_admin only,
-- same pattern as write_ups.
create policy "timecard_approvals_write" on public.timecard_approvals
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));
