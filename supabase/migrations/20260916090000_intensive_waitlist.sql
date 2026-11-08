-- The Daycare Owner Intensive: waitlist for the next session.
--
-- The September 12 2026 session has run and the next date is not set, so the
-- funnel collects names instead of payments (INTENSIVE.registration =
-- "waitlist"). Rows here are NOT customers -- nobody has paid anything and
-- joining commits them to nothing.
--
-- Written by the public funnel through the service-role client, which
-- bypasses RLS, exactly like intensive_registrations. There is deliberately
-- no insert policy for `authenticated`: the server action is the only writer,
-- so a browser session cannot stuff the list.
--
-- Every statement is idempotent and safe to re-run.

create table if not exists public.intensive_waitlist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  first_name text not null,
  last_name text not null,
  email text not null,

  -- Where the signup came from, so a later ad or partner push can be told
  -- apart from the funnel's own form.
  source text not null default 'funnel',

  created_at timestamptz not null default now()
);

-- One row per person. Somebody who submits the form twice is reassured that
-- they are on the list, not added again -- see joinWaitlist, which treats the
-- resulting 23505 as success rather than an error.
create unique index if not exists intensive_waitlist_email_idx
  on public.intensive_waitlist (tenant_id, lower(email));

create index if not exists intensive_waitlist_tenant_idx
  on public.intensive_waitlist (tenant_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.intensive_waitlist enable row level security;

-- Read-only, and only for the people who run the tenant -- the same rule the
-- paid registrations follow.
drop policy if exists "intensive_waitlist_select" on public.intensive_waitlist;
create policy "intensive_waitlist_select" on public.intensive_waitlist
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin')
  );

-- PostgREST caches the schema; without this the table is invisible to the
-- REST API until the cache happens to refresh on its own.
notify pgrst, 'reload schema';

-- Verification -- both should come back non-null / true.
select
  to_regclass('public.intensive_waitlist') as table_created,
  exists (
    select 1 from pg_policies
    where tablename = 'intensive_waitlist' and policyname = 'intensive_waitlist_select'
  ) as policy_created;
