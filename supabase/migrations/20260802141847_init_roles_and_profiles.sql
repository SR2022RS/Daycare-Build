-- AKPA University: roles, tenants (white-label customers), and profiles

create extension if not exists "pgcrypto";

create type public.app_role as enum ('platform_admin', 'director', 'staff');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  primary_color text not null default '#D4AF37',
  accent_color text not null default '#6E1F2E',
  powered_by_akpa boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  role public.app_role not null default 'staff',
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_tenant_id_idx on public.profiles (tenant_id);

-- Creates a profile row whenever a new auth user signs up.
-- Reads tenant_id/role/full_name from signup metadata (set client-side at signup time);
-- role defaults to 'staff' so a client can never self-elevate to director/platform_admin
-- by omission -- director/platform_admin assignment must go through a trusted server path.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, tenant_id, role, full_name, email)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'tenant_id')::uuid,
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'staff'),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
