-- Out-of-uniform warning log.
--
-- Not incident_reports: that table is the short kiosk note (what happened,
-- action taken, director sign-off). Not write_ups: those are staff
-- discipline, filed by a director about an employee. Not accident_reports:
-- those are injuries. A uniform offense is its own count (verbal, written,
-- then a $10 fee due) and must not land on any of those.
--
-- The fee is a flag only. This migration does not write charges, invoices,
-- or payments, and nothing here sends a message.
--
-- The step is assigned in a trigger from how many warnings this child
-- already has in the count window, so a crafted insert cannot skip ahead.
-- The same rules are in src/lib/uniforms/steps.ts for the preview.
--
-- Who can see a warning: every staff role in the tenant. The step is a
-- shared count; a teacher who can only see their own rows would log a
-- second "first" offense. Who can file: staff, director, platform_admin,
-- at a campus they can access. Who can change the reset rule: director
-- and platform_admin. Rows are not updated or deleted.

create type public.uniform_reset as enum ('school_year', 'calendar_year', 'never');
create type public.uniform_step as enum ('verbal', 'written', 'fee');

-- One row per tenant, created when a director saves the rule. No row means
-- the app uses the default: school year, starting September 1.
create table public.uniform_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  reset_mode public.uniform_reset not null default 'school_year',
  -- Day is capped at 28 so February is a real date.
  school_year_start_month smallint not null default 9,
  school_year_start_day smallint not null default 1,
  updated_at timestamptz not null default now(),
  constraint uniform_settings_month check (school_year_start_month between 1 and 12),
  constraint uniform_settings_day check (school_year_start_day between 1 and 28)
);

create table public.uniform_warnings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete restrict,
  child_id uuid not null,
  filed_by uuid not null references public.profiles (id),
  staff_name text not null,
  occurred_on date not null,
  missing_item text not null,
  note text,
  step public.uniform_step not null,
  -- True only on the fee step. Means "fee due", never "fee collected".
  fee_due boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uniform_warnings_missing_not_blank check (length(btrim(missing_item)) > 0),
  constraint uniform_warnings_staff_not_blank check (length(btrim(staff_name)) > 0),
  constraint uniform_warnings_fee_matches_step check (
    (step = 'fee' and fee_due = true)
    or (step <> 'fee' and fee_due = false)
  ),
  constraint uniform_warnings_child_tenant_fkey
    foreign key (child_id, tenant_id)
    references public.children (id, tenant_id)
    on delete cascade
);

create index uniform_warnings_tenant_child_idx
  on public.uniform_warnings (tenant_id, child_id, occurred_on);
create index uniform_warnings_location_id_idx on public.uniform_warnings (location_id);

comment on table public.uniform_warnings is
  'Out-of-uniform log. step 1 verbal, step 2 written, step 3 and after are a $10 fee due. No charge is created.';
comment on column public.uniform_warnings.fee_due is
  'Fee due only. Not a payment and not a billing charge.';

-- Count window for one date. Mirrors windowStart() in src/lib/uniforms/steps.ts.
create function public.uniform_window_start(p_tenant uuid, p_on date)
returns date
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_mode public.uniform_reset := 'school_year';
  v_month int := 9;
  v_day int := 1;
  v_year int := extract(year from p_on);
  v_month_of int := extract(month from p_on);
  v_day_of int := extract(day from p_on);
begin
  select reset_mode, school_year_start_month, school_year_start_day
    into v_mode, v_month, v_day
  from public.uniform_settings
  where tenant_id = p_tenant;

  v_mode := coalesce(v_mode, 'school_year');
  v_month := coalesce(v_month, 9);
  v_day := coalesce(v_day, 1);

  if v_mode = 'never' then
    return null;
  elsif v_mode = 'calendar_year' then
    return make_date(v_year, 1, 1);
  elsif v_month_of > v_month or (v_month_of = v_month and v_day_of >= v_day) then
    return make_date(v_year, v_month, v_day);
  else
    return make_date(v_year - 1, v_month, v_day);
  end if;
end;
$$;

create function public.assign_uniform_step()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_start date := public.uniform_window_start(new.tenant_id, new.occurred_on);
  v_count int;
begin
  select count(*) into v_count
  from public.uniform_warnings
  where tenant_id = new.tenant_id
    and child_id = new.child_id
    and (v_start is null or occurred_on >= v_start);

  if v_count <= 0 then
    new.step := 'verbal';
    new.fee_due := false;
  elsif v_count = 1 then
    new.step := 'written';
    new.fee_due := false;
  else
    new.step := 'fee';
    new.fee_due := true;
  end if;

  return new;
end;
$$;

create trigger assign_uniform_step
  before insert on public.uniform_warnings
  for each row execute function public.assign_uniform_step();

alter table public.uniform_settings enable row level security;
alter table public.uniform_warnings enable row level security;

create policy "uniform_settings_select" on public.uniform_settings
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin', 'staff')
  );

create policy "uniform_settings_write" on public.uniform_settings
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin')
  );

create policy "uniform_warnings_select" on public.uniform_warnings
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin', 'staff')
  );

create policy "uniform_warnings_insert" on public.uniform_warnings
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and filed_by = auth.uid()
    and public.current_role() in ('director', 'platform_admin', 'staff')
    and public.has_location_access(location_id)
  );

create trigger set_uniform_settings_updated_at
  before update on public.uniform_settings
  for each row execute function public.set_updated_at();
