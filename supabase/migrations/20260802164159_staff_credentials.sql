-- Staff credential tracking (CARI/CHRI/Mantoux/medical exam/orientation/
-- licensing), with auto-computed renewal dates for the two credentials that
-- have a stated renewal cycle. Display-only surfacing, not an enforced
-- lockout -- see the supervision-gate query in lib/staff/credentials.ts.

create type public.credential_type as enum (
  'cari',
  'chri',
  'mantoux',
  'medical_exam',
  'orientation_new_hire',
  'orientation_annual',
  'understanding_licensing'
);

create table public.staff_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  staff_id uuid not null references public.profiles (id) on delete cascade,
  credential_type public.credential_type not null,
  date_submitted date,
  date_cleared date,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, credential_type)
);

create index staff_credentials_tenant_id_idx on public.staff_credentials (tenant_id);
create index staff_credentials_staff_id_idx on public.staff_credentials (staff_id);

-- Renewal logic: CARI clears for 3 years, Orientation (Annual) for 1 year.
-- Every other credential type has no stated renewal cycle in the source
-- packet, so expires_at is left as explicitly set (or null) for those.
create function public.set_credential_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.date_cleared is not null then
    if new.credential_type = 'cari' then
      new.expires_at := (new.date_cleared + interval '3 years')::date;
    elsif new.credential_type = 'orientation_annual' then
      new.expires_at := (new.date_cleared + interval '1 year')::date;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_staff_credentials_expiry
  before insert or update on public.staff_credentials
  for each row execute function public.set_credential_expiry();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.staff_credentials enable row level security;

-- Staff can see their own credential records; directors see everyone in tenant.
create policy "staff_credentials_select" on public.staff_credentials
  for select to authenticated
  using (
    staff_id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  );

-- Clearance is an HR/compliance record -- staff cannot self-certify, same
-- pattern as write_ups.
create policy "staff_credentials_write" on public.staff_credentials
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));
