-- Policies Library: parent handbook, staff handbook, SOPs

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  category text not null, -- e.g. 'Parent Handbook', 'Staff Handbook', 'SOP'
  file_url text not null,
  version text not null default '1.0',
  updated_at timestamptz not null default now()
);

create index policies_tenant_id_idx on public.policies (tenant_id);

create trigger set_policies_updated_at
  before update on public.policies
  for each row execute function public.set_updated_at();
