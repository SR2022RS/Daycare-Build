-- Locations (multi-center support per tenant) and staff-to-location assignment

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  address text,
  timezone text not null default 'America/New_York',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index locations_tenant_id_idx on public.locations (tenant_id);

-- Many-to-many: a staffer can be assigned to more than one location within their tenant.
create table public.staff_locations (
  staff_id uuid not null references public.profiles (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  primary key (staff_id, location_id)
);
