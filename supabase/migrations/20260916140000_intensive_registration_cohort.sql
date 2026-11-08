-- Which session a paid seat belongs to.
--
-- The Sept 12 2026 class has run, but the $300 payment link stays live on
-- purpose: anyone paying now is buying a seat at the NEXT session, whose date
-- is not set yet. Without this column those buyers land in the same list as
-- the people who already attended, and the day the next date is announced the
-- reminder job would email September's attendees about a class they have
-- already taken.
--
-- Existing rows default to '2026-09' -- every row that exists today is from
-- the session that already happened. New purchases are stamped by the app
-- with INTENSIVE.cohort, which is "next" until a date is set.
--
-- When the next date IS set, config flips cohort to e.g. "2027-03" and the
-- rows carrying "next" are renamed to match in one update.
--
-- Idempotent; safe to re-run.

alter table public.intensive_registrations
  add column if not exists cohort text not null default '2026-09';

create index if not exists intensive_registrations_cohort_idx
  on public.intensive_registrations (tenant_id, cohort, created_at desc);

comment on column public.intensive_registrations.cohort is
  'Which session this seat is for. "next" = paid before the next date was announced.';

-- PostgREST caches the schema; without this the new column is invisible to
-- the REST API until the cache happens to refresh on its own.
notify pgrst, 'reload schema';

-- Verification: the column exists, and every existing row is marked as the
-- session that already ran.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'intensive_registrations'
      and column_name = 'cohort'
  ) as column_created,
  (select count(*) from public.intensive_registrations where cohort = '2026-09') as backfilled_rows;
