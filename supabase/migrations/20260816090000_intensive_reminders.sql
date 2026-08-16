-- Reminder emails for The Daycare Owner Intensive.
--
-- One row per (registration, stage) that has actually been sent, rather
-- than boolean columns on intensive_registrations. Two reasons:
--
--   1. The unique constraint IS the idempotency guard. The cron can run
--      twice, overlap itself, or be retried after a partial failure, and
--      nobody gets the same reminder twice -- the insert simply conflicts.
--   2. Stages are data, not schema. Changing the schedule (adding a
--      three-day nudge, dropping the week-before) needs no migration.
--
-- Written only by the cron route via the service-role client, same as
-- registrations: there is no insert policy for `authenticated` below.

create table if not exists public.intensive_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.intensive_registrations (id) on delete cascade,

  -- 'week' | 'day' | 'morning' -- kept as text, not an enum, so the
  -- schedule can change without a migration.
  stage text not null,

  sent_at timestamptz not null default now()
);

-- The idempotency guard: one send per registration per stage, ever.
create unique index if not exists intensive_reminder_sends_unique
  on public.intensive_reminder_sends (registration_id, stage);

create index if not exists intensive_reminder_sends_registration_idx
  on public.intensive_reminder_sends (registration_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.intensive_reminder_sends enable row level security;

-- Readable by the same people who can see the registrations themselves, so
-- the admin view can show what has gone out. No insert/update policy: only
-- the service-role client writes here.
drop policy if exists "intensive_reminder_sends_select" on public.intensive_reminder_sends;
create policy "intensive_reminder_sends_select" on public.intensive_reminder_sends
  for select to authenticated
  using (
    exists (
      select 1 from public.intensive_registrations r
      where r.id = intensive_reminder_sends.registration_id
        and r.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

notify pgrst, 'reload schema';

select
  to_regclass('public.intensive_reminder_sends') as table_created;
