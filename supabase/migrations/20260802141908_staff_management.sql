-- Staff Management: clock in/out attendance and write-ups/incident reports

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  staff_id uuid not null references public.profiles (id) on delete cascade,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (staff_id, date)
);

create index attendance_tenant_id_idx on public.attendance (tenant_id);
create index attendance_location_id_idx on public.attendance (location_id);

create table public.write_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  staff_id uuid not null references public.profiles (id) on delete cascade,
  issued_by uuid not null references public.profiles (id),
  reason text not null,
  notes text,
  severity text not null default 'minor' check (severity in ('minor', 'moderate', 'severe')),
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index write_ups_tenant_id_idx on public.write_ups (tenant_id);
create index write_ups_staff_id_idx on public.write_ups (staff_id);
