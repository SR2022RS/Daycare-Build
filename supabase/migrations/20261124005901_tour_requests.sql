-- Public tour requests, plus the admin inbox.
--
-- Parents have no account. The form does not insert as anon: the server
-- action uses the service role after a honeypot and rate-limit check.
-- anon gets no privileges. authenticated can select and update, and cannot
-- insert. RLS still limits that to director and platform_admin in the tenant.
--
-- Nothing in this table sends email, SMS, or a CRM webhook.

create type public.tour_status as enum (
  'new',
  'contacted',
  'toured',
  'enrolled',
  'not_interested'
);

create table public.tour_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete restrict,
  parent_name text not null,
  phone text not null,
  email text not null,
  child_ages text not null,
  desired_start date,
  preferred_time text,
  heard_about text,
  notes text,
  status public.tour_status not null default 'new',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_requests_parent_not_blank check (length(btrim(parent_name)) > 0),
  constraint tour_requests_phone_not_blank check (length(btrim(phone)) > 0),
  constraint tour_requests_email_not_blank check (length(btrim(email)) > 0),
  constraint tour_requests_ages_not_blank check (length(btrim(child_ages)) > 0)
);

create index tour_requests_tenant_location_idx
  on public.tour_requests (tenant_id, location_id, created_at desc);
create index tour_requests_status_idx on public.tour_requests (status);

comment on table public.tour_requests is
  'Schedule-a-tour requests. Inserts go through the service role. No message is sent.';

alter table public.tour_requests enable row level security;

create policy "tour_requests_select" on public.tour_requests
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin')
  );

create policy "tour_requests_update" on public.tour_requests
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin')
  );

revoke all on table public.tour_requests from public;
revoke all on table public.tour_requests from anon;
revoke all on table public.tour_requests from authenticated;
grant select, update on table public.tour_requests to authenticated;
grant all on table public.tour_requests to service_role;

create trigger set_tour_requests_updated_at
  before update on public.tour_requests
  for each row execute function public.set_updated_at();
