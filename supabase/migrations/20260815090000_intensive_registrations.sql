-- The Daycare Owner Intensive: paid-seat registrations for the public
-- /intensive funnel.
--
-- Rows here are written by the payment webhook using the service-role
-- client (which bypasses RLS), never by the browser redirect -- a user can
-- skip, replay or forge the success_url, so it is not a payment receipt.
-- That is why there is no insert/update policy for `authenticated` below:
-- nobody holding a normal session can forge a paid seat.
--
-- Payments are not wired yet (see src/lib/intensive/actions.ts). This table
-- is the destination that flow lands in; until then it stays empty and the
-- admin view renders its empty state.
--
-- Every statement is idempotent, so this can be re-run safely -- including
-- after a partial apply that created the enum but not the table.

do $$
begin
  create type public.intensive_payment_status as enum ('pending', 'paid', 'refunded', 'failed');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.intensive_registrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  first_name text not null,
  last_name text not null,
  email text not null,

  -- Stored in cents to avoid float money. $300 -> 30000.
  amount_cents integer not null,
  currency text not null default 'usd',
  status public.intensive_payment_status not null default 'pending',

  -- The checkout session is the idempotency key: a webhook that fires twice
  -- (or arrives after the browser already hit /confirmed) must not create a
  -- second row. The same person registering twice with two real sessions is
  -- allowed on purpose -- the brief says do not block that.
  checkout_session_id text not null,
  payment_intent_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists intensive_registrations_session_idx
  on public.intensive_registrations (checkout_session_id);

create index if not exists intensive_registrations_tenant_idx
  on public.intensive_registrations (tenant_id, created_at desc);

-- Case-insensitive lookup for "has this person already registered".
create index if not exists intensive_registrations_email_idx
  on public.intensive_registrations (tenant_id, lower(email));

drop trigger if exists set_intensive_registrations_updated_at on public.intensive_registrations;
create trigger set_intensive_registrations_updated_at
  before update on public.intensive_registrations
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.intensive_registrations enable row level security;

-- Read-only, and only for the people who run the tenant. Staff have no
-- reason to see who paid $300 for the owner intensive.
drop policy if exists "intensive_registrations_select" on public.intensive_registrations;
create policy "intensive_registrations_select" on public.intensive_registrations
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin')
  );

-- PostgREST caches the schema; without this the table is invisible to the
-- REST API until the cache happens to refresh on its own.
notify pgrst, 'reload schema';

-- Verification -- both columns should come back non-null / true.
select
  to_regclass('public.intensive_registrations') as table_created,
  exists (select 1 from pg_type where typname = 'intensive_payment_status') as enum_created;
