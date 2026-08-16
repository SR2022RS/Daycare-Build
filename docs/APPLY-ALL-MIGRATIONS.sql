-- ============================================================================
-- AKPA University — billing engine, overpayment credits, rooms & waitlist
-- Ten migrations, in the ONLY order they may be applied.
--
-- HOW TO USE
--   Run STEP 0 first and read its output. Then run each numbered section
--   below one at a time, in order, checking for errors before moving on.
--   None of these are re-runnable: if a section succeeds, do not run it twice.
--
-- WHAT THIS CHANGES
--   * Creates: charges, invoices, payments (+ RLS, indexes, triggers)
--   * Creates: child_balance_status view (staff-safe, no dollar amounts)
--   * Alters:  children (subsidy_weekly_amount, room_id, waitlist dates,
--              guardian_id/source_invoice_id on charges)
--   * Alters:  rooms (capacity, min/max age months)
--   * INSTALLS A CRON JOB that bills real families daily at 06:00 UTC.
--     See the warning above section 2.
--
-- NOTHING HERE HAS EVER RUN. Every statement is reviewed but unexecuted.
-- ============================================================================


-- ============================================================================
-- STEP 0 — PRECONDITION CHECK.  Run this ALONE, first. Change nothing yet.
-- ============================================================================
select
  to_regclass('public.tenants')   is not null as has_tenants,
  to_regclass('public.locations') is not null as has_locations,
  to_regclass('public.profiles')  is not null as has_profiles,
  to_regclass('public.children')  is not null as has_children,
  to_regclass('public.guardians') is not null as has_guardians,
  to_regclass('public.rooms')     is not null as has_rooms,
  to_regclass('public.charges')   is null     as billing_not_yet_applied;

-- EXPECTED: every column true.
--
-- If has_rooms is FALSE, STOP. `public.rooms` is created by
-- supabase/migrations/20260813090000_kiosk_access.sql, which is still
-- UNCOMMITTED in your working tree. Section 10 does `alter table public.rooms`
-- and will abort the whole run without it. Apply that migration first
-- (and 20260804090000_pin_login.sql / 20260813150000_support_tickets.sql if
-- those are also unapplied), then come back here.
--
-- If billing_not_yet_applied is FALSE, some of this has already been applied.
-- STOP and tell Claude which tables already exist rather than guessing.



-- ============================================================================
-- SECTION 1 — 20260814120000_billing_engine.sql
-- ============================================================================

-- Money Module Steps 3-5: charges, invoices, payments.
-- Extends children/guardians per the Step 2 note ("do not fork").
-- Director/platform_admin only; staff get a restricted view in a later
-- migration (see child_balance_status).

create type public.charge_type as enum ('tuition', 'fee', 'credit', 'adjustment');
create type public.invoice_status as enum ('open', 'partial', 'paid', 'void');
-- 'stripe' is reserved for the future online-collection phase; adding it
-- now avoids an enum migration when that lands.
create type public.payment_method as enum ('cash', 'check', 'zelle', 'venmo', 'other', 'stripe');

-- Portion of weekly_rate covered by subsidy. Null for private-pay children;
-- parent copay is always weekly_rate - coalesce(subsidy_weekly_amount, 0).
alter table public.children
  add column subsidy_weekly_amount numeric(10, 2);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status public.invoice_status not null default 'open',
  total_amount numeric(10, 2) not null default 0,
  amount_paid numeric(10, 2) not null default 0,
  due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_tenant_id_idx on public.invoices (tenant_id);
create index invoices_guardian_id_idx on public.invoices (guardian_id);
create index invoices_status_idx on public.invoices (status);

-- One open invoice per guardian per period -- the grouping key the charge
-- generator looks up before deciding to create a new invoice.
create unique index invoices_guardian_period_key
  on public.invoices (guardian_id, period_start, period_end)
  where status <> 'void';

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  type public.charge_type not null,
  period_start date,
  period_end date,
  description text not null,
  subsidy_amount numeric(10, 2) not null default 0,
  parent_amount numeric(10, 2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  void boolean not null default false,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  -- Credits legitimately carry a negative parent_amount (they reduce what's
  -- owed), so this is scoped to tuition only: a data-entry error where
  -- subsidy_weekly_amount exceeds weekly_rate must not be able to push a
  -- tuition charge's parent_amount negative and silently shrink a family's
  -- invoice. generate_recurring_charges also clamps this defensively; this
  -- constraint is the backstop for any other insert path.
  constraint charges_tuition_parent_amount_non_negative
    check (type <> 'tuition' or parent_amount >= 0)
);

create index charges_tenant_id_idx on public.charges (tenant_id);
create index charges_child_id_idx on public.charges (child_id);
create index charges_invoice_id_idx on public.charges (invoice_id);

-- Idempotency: a child can only have one live tuition charge per period,
-- so re-running the generator (cron or the manual button) is a no-op.
create unique index charges_tuition_period_key
  on public.charges (child_id, period_start)
  where type = 'tuition' and void = false;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  method public.payment_method not null,
  paid_at date not null,
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);

create index payments_tenant_id_idx on public.payments (tenant_id);
create index payments_invoice_id_idx on public.payments (invoice_id);

create trigger set_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.invoices enable row level security;

create policy "invoices_select" on public.invoices
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "invoices_write" on public.invoices
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

alter table public.charges enable row level security;

create policy "charges_select" on public.charges
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "charges_write" on public.charges
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

alter table public.payments enable row level security;

create policy "payments_select" on public.payments
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "payments_write" on public.payments
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));


-- ============================================================================
-- SECTION 2 — 20260814120100_billing_generation.sql
--
-- ⚠️  THIS SECTION INSTALLS THE DAILY BILLING CRON JOB.
--     After it runs, 'daily-billing' fires at 06:00 UTC every day and
--     generates real tuition charges for real families, unattended.
--     pg_cron may need enabling first: Dashboard > Database > Extensions.
--     To stop it at any time:  select cron.unschedule('daily-billing');
-- ============================================================================

-- Money Module Step 3-4 continued: charge generation function + pg_cron.
-- Builds on 20260814120000_billing_engine.sql (charges, invoices, payments).
-- The generator lives in SQL so the daily cron job and the manual
-- "Generate now" button run identical logic. It mirrors the TypeScript
-- period math in src/lib/billing/periods.ts -- those tests are the
-- specification for this function's date behavior.

-- Recomputes an invoice's total from its live charges and re-derives status
-- from what's been paid. Called after any charge or payment change.
create or replace function public.recalc_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(10, 2);
  v_paid numeric(10, 2);
  v_status public.invoice_status;
begin
  select coalesce(sum(parent_amount), 0) into v_total
  from public.charges
  where invoice_id = p_invoice_id and void = false;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = p_invoice_id;

  if (select status from public.invoices where id = p_invoice_id) = 'void' then
    return;
  end if;

  -- A fully-credited invoice (total <= 0) is settled regardless of amount
  -- paid. Checking this first matters: v_paid <= 0 also holds when nothing
  -- has been paid, and without this branch that case would win and leave
  -- the invoice at 'open' forever even though nothing is owed.
  if v_total <= 0 then
    v_status := 'paid';
  elsif v_paid <= 0 then
    v_status := 'open';
  elsif v_paid < v_total then
    v_status := 'partial';
  else
    v_status := 'paid';
  end if;

  update public.invoices
  set total_amount = v_total, amount_paid = v_paid, status = v_status
  where id = p_invoice_id;
end;
$$;

-- `revoke ... from public` alone is not enough: Supabase's default schema
-- privileges grant EXECUTE directly to anon/authenticated/service_role at
-- function-creation time, independent of the PUBLIC pseudo-role, so each
-- unwanted grantee needs an explicit revoke (see pin_login.sql). This
-- function is security definer with no tenant check and rewrites
-- total_amount/amount_paid/status on an arbitrary invoice_id -- a direct
-- RPC call would let anyone rewrite any invoice in any tenant, so it's
-- internal only (called from generate_recurring_charges_impl below, and
-- future payment-recording code) and reachable by no REST role at all.
revoke all on function public.recalc_invoice_totals(uuid) from public, anon, authenticated, service_role;

-- Generates one tuition charge per active child whose cadence period starts
-- on p_on, attaches it to the payer guardian's invoice for that period
-- (creating the invoice if needed), and prorates the child's first period.
-- Idempotent: the charges_tuition_period_key index makes re-runs no-ops.
--
-- Split into an internal implementation (this function, iterates a single
-- tenant with no auth check of its own) and a director-facing wrapper
-- (below, enforces the tenant/role guard) rather than one function with a
-- "p_internal" flag parameter. A flag parameter would still be reachable by
-- any authenticated caller through PostgREST's RPC endpoint -- they would
-- just pass {"p_internal": true} in the request body -- because the only
-- boundary Postgres actually enforces is the GRANT system, not which
-- argument values a caller chooses to send. So the guard-bypassing code
-- path lives in a function `authenticated` is never granted EXECUTE on.
create or replace function public.generate_recurring_charges_impl(
  p_tenant_id uuid,
  p_on date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child record;
  v_period_start date;
  v_period_end date;
  v_first_monday date;
  v_third_monday date;
  v_next_first_monday date;
  v_fraction numeric;
  v_total_days integer;
  v_billed_days integer;
  v_subsidy numeric(10, 2);
  v_parent numeric(10, 2);
  v_period_rate numeric(10, 2);
  v_guardian_id uuid;
  v_invoice_id uuid;
  v_new_invoice boolean;
  v_created integer := 0;
begin
  -- Period boundaries per cadence, mirroring src/lib/billing/periods.ts.
  v_first_monday := date_trunc('month', p_on)::date
    + ((8 - extract(dow from date_trunc('month', p_on))::integer) % 7);
  v_third_monday := v_first_monday + 14;
  v_next_first_monday := (date_trunc('month', p_on) + interval '1 month')::date
    + ((8 - extract(dow from (date_trunc('month', p_on) + interval '1 month'))::integer) % 7);

  for v_child in
    select c.id, c.location_id, c.weekly_rate, c.subsidy_weekly_amount,
           c.cadence, c.funding_type, c.start_date
    from public.children c
    where c.tenant_id = p_tenant_id
      and c.status = 'active'
      and c.weekly_rate is not null
  loop
    v_period_start := null;
    v_period_end := null;

    if v_child.cadence = 'monthly' then
      if extract(day from p_on) = 1 then
        v_period_start := p_on;
        v_period_end := (date_trunc('month', p_on) + interval '1 month' - interval '1 day')::date;
        v_period_rate := v_child.weekly_rate * 52 / 12;
      end if;

    elsif v_child.cadence = 'weekly' then
      if extract(dow from p_on) = 1 then
        v_period_start := p_on;
        v_period_end := p_on + 6;
        v_period_rate := v_child.weekly_rate;
      end if;

    elsif v_child.cadence = 'biweekly' then
      if p_on = v_first_monday then
        v_period_start := p_on;
        v_period_end := v_third_monday - 1;
        v_period_rate := v_child.weekly_rate * 2;
      elsif p_on = v_third_monday then
        v_period_start := p_on;
        v_period_end := v_next_first_monday - 1;
        v_period_rate := v_child.weekly_rate * 2;
      end if;
    end if;

    continue when v_period_start is null;

    -- Skip children who haven't started yet as of this period's end.
    continue when v_child.start_date is not null and v_child.start_date > v_period_end;

    -- Prorate the first period if enrollment lands mid-period.
    v_fraction := 1;
    if v_child.start_date is not null and v_child.start_date > v_period_start then
      v_total_days := (v_period_end - v_period_start) + 1;
      v_billed_days := (v_period_end - v_child.start_date) + 1;
      v_fraction := round(v_billed_days::numeric / v_total_days::numeric, 4);
    end if;

    -- Split subsidy vs parent copay. Private-pay children carry no subsidy.
    -- weekly_rate is filtered not null above but can legitimately be 0;
    -- nullif guards the division so a zero rate can't raise
    -- division_by_zero and abort the whole run, and coalesce folds the
    -- resulting null back to 0 so the not-null subsidy_amount column holds.
    if v_child.funding_type = 'private' or v_child.subsidy_weekly_amount is null then
      v_subsidy := 0;
      -- weekly_rate carries no >= 0 check (children already holds live
      -- production data that might violate one, so ruling out that
      -- constraint deliberately -- see round-1 report). A negative rate
      -- would otherwise produce a negative parent_amount here and trip
      -- charges_tuition_parent_amount_non_negative as a check_violation,
      -- which -- unlike unique_violation below -- is never caught, so it
      -- would escape this function, escape run_daily_billing's tenant
      -- loop, and abort the nightly run for every remaining tenant.
      v_parent := greatest(round(v_period_rate * v_fraction, 2), 0);
    else
      v_subsidy := coalesce(round(
        (v_child.subsidy_weekly_amount * (v_period_rate / nullif(v_child.weekly_rate, 0))) * v_fraction, 2), 0);
      -- subsidy_weekly_amount carries no check against weekly_rate, so a
      -- data-entry error (subsidy > rate) must not push parent_amount
      -- negative and silently shrink the family's invoice. Clamp subsidy to
      -- the period amount so subsidy_amount + parent_amount always sums to
      -- the period total, and parent_amount never goes below 0. Also floor
      -- subsidy itself at 0: a negative subsidy_weekly_amount (another
      -- data-entry error, no check constraint on that column either) would
      -- otherwise pass the upper clamp and break the sum invariant the
      -- other direction (parent_amount > the period rate). The
      -- charges_tuition_parent_amount_non_negative constraint backstops
      -- parent_amount for any other insert path, but weekly_rate can also
      -- be negative -- see the comment in the private-pay branch above --
      -- so parent_amount is floored at 0 here too.
      v_subsidy := greatest(least(v_subsidy, round(v_period_rate * v_fraction, 2)), 0);
      v_parent := greatest(round(v_period_rate * v_fraction, 2) - v_subsidy, 0);
    end if;

    -- The payer guardian groups the invoice. Skip children with no payer set.
    select cg.guardian_id into v_guardian_id
    from public.child_guardians cg
    where cg.child_id = v_child.id and cg.is_payer = true
    limit 1;

    continue when v_guardian_id is null;

    -- Reuse this guardian's invoice for the period, or open one. tenant_id
    -- is redundant with guardian_id (a guardian belongs to one tenant) but
    -- scoped here anyway for defense in depth.
    select i.id into v_invoice_id
    from public.invoices i
    where i.tenant_id = p_tenant_id
      and i.guardian_id = v_guardian_id
      and i.period_start = v_period_start
      and i.period_end = v_period_end
      and i.status <> 'void'
    limit 1;

    v_new_invoice := false;

    if v_invoice_id is null then
      -- on conflict guards against a concurrent cron run and a director's
      -- "Generate now" click racing to open the same guardian+period
      -- invoice, which would otherwise hit invoices_guardian_period_key and
      -- abort the whole generation run for every remaining child.
      insert into public.invoices (
        tenant_id, location_id, guardian_id, period_start, period_end, due_date
      )
      values (
        p_tenant_id, v_child.location_id, v_guardian_id, v_period_start, v_period_end,
        -- Uniform 7-day offset for every cadence, by design -- per-cadence
        -- due dates (e.g. a longer grace window for monthly invoices) are an
        -- explicit spec non-goal, not an oversight. Revisit here if that
        -- ever changes.
        v_period_start + 7
      )
      on conflict (guardian_id, period_start, period_end) where status <> 'void'
      do nothing
      returning id into v_invoice_id;

      if v_invoice_id is null then
        -- Lost the race; pick up the invoice the concurrent run created.
        select i.id into v_invoice_id
        from public.invoices i
        where i.tenant_id = p_tenant_id
          and i.guardian_id = v_guardian_id
          and i.period_start = v_period_start
          and i.period_end = v_period_end
          and i.status <> 'void'
        limit 1;
      else
        v_new_invoice := true;
      end if;
    end if;

    begin
      insert into public.charges (
        tenant_id, location_id, child_id, invoice_id, type,
        period_start, period_end, description, subsidy_amount, parent_amount
      )
      values (
        p_tenant_id, v_child.location_id, v_child.id, v_invoice_id, 'tuition',
        v_period_start, v_period_end,
        'Tuition ' || to_char(v_period_start, 'Mon DD') || ' – ' || to_char(v_period_end, 'Mon DD'),
        v_subsidy, v_parent
      );
      v_created := v_created + 1;
    exception when unique_violation then
      -- Already charged for this period -- e.g. this guardian's invoice for
      -- the period was voided and a fresh one just opened above, but the
      -- tuition charge itself was never voided, so
      -- charges_tuition_period_key still blocks re-insertion. Leave the
      -- existing charge alone, and if we just opened a brand-new invoice
      -- for this attempt, delete it so it doesn't linger as an empty,
      -- perpetually-regenerated $0 open invoice.
      if v_new_invoice then
        delete from public.invoices where id = v_invoice_id;
        v_invoice_id := null;
      end if;
    end;

    if v_invoice_id is not null then
      perform public.recalc_invoice_totals(v_invoice_id);
    end if;
  end loop;

  return v_created;
end;
$$;

-- `revoke ... from public` alone is not enough -- see the comment on
-- recalc_invoice_totals above. Internal only: reachable by no REST role.
-- Its owner -- this migration's role, which also owns the wrapper below
-- and run_daily_billing -- can still call it, because security definer
-- functions execute with their owner's privileges regardless of grants.
revoke all on function public.generate_recurring_charges_impl(uuid, date) from public, anon, authenticated, service_role;

-- Director-facing entry point: enforces "you may only generate charges for
-- your own tenant, and only if you're a director/platform_admin" before
-- delegating to the real implementation. This is the function the app's
-- .rpc('generate_recurring_charges', { p_tenant_id, p_on }) call reaches.
create or replace function public.generate_recurring_charges(
  p_tenant_id uuid,
  p_on date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id is distinct from public.current_tenant_id()
     or public.current_role() not in ('director', 'platform_admin') then
    raise exception 'not authorized to generate charges for tenant %', p_tenant_id;
  end if;

  return public.generate_recurring_charges_impl(p_tenant_id, p_on);
end;
$$;

-- `revoke ... from public` alone is not enough -- see the comment on
-- recalc_invoice_totals above. This is the intended director-facing entry
-- point (its body enforces tenant + role), so authenticated keeps EXECUTE;
-- anon (no session, so current_tenant_id()/current_role() would just be
-- null) gets no grant at all.
revoke all on function public.generate_recurring_charges(uuid, date) from public, anon;
grant execute on function public.generate_recurring_charges(uuid, date) to authenticated;

-- pg_cron is new here: no prior migration enables it. Runs daily at 06:00 UTC
-- and lets generate_recurring_charges_impl decide whether today actually
-- starts a period for each child's cadence.
--
-- Unlike pgcrypto (installed `with schema extensions` elsewhere in this
-- repo -- see 20260804090000_pin_login.sql), pg_cron is NOT relocatable: its
-- control file hardcodes schema `cron`, so `with schema extensions` doesn't
-- move it there -- it makes the CREATE EXTENSION statement itself fail
-- ("extension \"pg_cron\" must be installed in schema \"cron\""), aborting
-- this entire migration (including recalc_invoice_totals, both generator
-- functions, and every revoke above) before `cron.schedule(...)` below is
-- ever reached. Installing with no schema clause lets it land in its
-- required `cron` schema, which is what `cron.schedule` on the line below
-- actually resolves against. pg_cron may also need enabling in the Supabase
-- dashboard (Database → Extensions) before this statement succeeds if it
-- isn't already allow-listed for the project.
create extension if not exists pg_cron;

-- Iterates every tenant and calls the internal implementation directly,
-- bypassing the director/tenant guard on the public wrapper -- that's the
-- whole point of this job, since it must act across all tenants, not just
-- one caller's own.
create or replace function public.run_daily_billing()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant record;
begin
  for v_tenant in select id from public.tenants loop
    perform public.generate_recurring_charges_impl(v_tenant.id, current_date);
  end loop;
end;
$$;

-- `revoke ... from public` alone is not enough -- see the comment on
-- recalc_invoice_totals above. Fans out to every tenant with no auth check
-- of its own, so it must be reachable by no REST role at all -- otherwise
-- anon/authenticated could trigger a full, all-tenant billing run on
-- demand. Supabase runs scheduled pg_cron jobs as the role that registered
-- them (this migration's role, which owns this function), not as an API
-- caller, so revoking every REST role still leaves cron.schedule's
-- invocation working.
revoke all on function public.run_daily_billing() from public, anon, authenticated, service_role;

select cron.schedule(
  'daily-billing',
  '0 6 * * *',
  $$select public.run_daily_billing();$$
);


-- ============================================================================
-- SECTION 3 — 20260814120200_billing_balance_view.sql
-- ============================================================================

-- Money Module Step 5: staff-visible balance view.
-- Builds on 20260814120000_billing_engine.sql (charges, invoices) and
-- 20260814120100_billing_generation.sql (charge generation).

-- Staff-safe balance signal: status only, never amounts. security_invoker =
-- false makes the view run with its owner's rights, bypassing RLS on
-- children/charges/invoices entirely -- views cannot carry RLS policies of
-- their own. What actually scopes this view to the caller's tenant is the
-- `where c.tenant_id = public.current_tenant_id()` filter below;
-- current_tenant_id() reads auth.uid(), so it still resolves correctly
-- under owner rights. Without that filter, any authenticated user could
-- select every child_id/tenant_id/balance_status across every tenant in
-- the database.
create view public.child_balance_status
with (security_invoker = false)
as
select
  c.id as child_id,
  c.tenant_id,
  case
    when exists (
      select 1
      from public.charges ch
      join public.invoices i on i.id = ch.invoice_id
      where ch.child_id = c.id
        and ch.void = false
        and i.status in ('open', 'partial')
        and i.due_date < current_date
    ) then 'overdue'
    else 'current'
  end as balance_status
from public.children c
where c.tenant_id = public.current_tenant_id();

alter view public.child_balance_status set (security_barrier = true);

-- `revoke ... from public` alone is not enough: Supabase's default schema
-- privileges grant SELECT directly to anon/authenticated at
-- object-creation time, independent of the PUBLIC pseudo-role, so each
-- unwanted grantee needs an explicit revoke (see pin_login.sql). Fails
-- closed today either way -- an anon caller has no auth.uid(), so
-- current_tenant_id() is null and the tenant filter above returns zero
-- rows -- but naming anon explicitly here keeps this consistent with every
-- other grant in this migration set instead of relying on that side effect.
revoke all on public.child_balance_status from public, anon;
grant select on public.child_balance_status to authenticated;


-- ============================================================================
-- SECTION 4 — 20260814120300_billing_recalc_triggers.sql
-- ============================================================================

-- Money Module fix round 1 (tasks 5-7 review, Critical 1 / Controller Ruling D).
-- Builds on 20260814120000_billing_engine.sql (charges, invoices, payments)
-- and 20260814120100_billing_generation.sql (public.recalc_invoice_totals).
--
-- recalc_invoice_totals is revoked from every REST role (see the comment on
-- it in 20260814120100_billing_generation.sql) -- correctly, since it is
-- security definer with no tenant check and would let anyone rewrite any
-- invoice's totals directly. But that means the app's own
-- .rpc("recalc_invoice_totals", ...) calls on payment/charge writes were
-- silently unauthorized: money got recorded while total_amount/amount_paid/
-- status on the parent invoice never moved. Rather than opening a new grant
-- (which reintroduces the same arbitrary-invoice-rewrite hole), invoice
-- totals become trigger-maintained here: every insert/update/delete on
-- charges or payments recalculates its own invoice automatically, on every
-- write path (app today, a future Stripe webhook, manual SQL), with no
-- EXECUTE grant needed by the firing user at all.

-- Recalculates whichever invoice(s) a charges/payments row insert, update,
-- or delete affects. For INSERT and DELETE there is only ever one affected
-- invoice (NEW.invoice_id or OLD.invoice_id respectively, so
-- coalesce(NEW.invoice_id, OLD.invoice_id) picks the right one). For UPDATE,
-- invoice_id itself does not normally change, but if it ever does (e.g. a
-- charge gets re-pointed at a different invoice), both the old and the new
-- invoice need their totals recalculated, or the old invoice would be left
-- overstated forever.
create or replace function public.trg_recalc_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and NEW.invoice_id is distinct from OLD.invoice_id then
    if OLD.invoice_id is not null then
      perform public.recalc_invoice_totals(OLD.invoice_id);
    end if;
    if NEW.invoice_id is not null then
      perform public.recalc_invoice_totals(NEW.invoice_id);
    end if;
    return NEW;
  end if;

  if coalesce(NEW.invoice_id, OLD.invoice_id) is not null then
    perform public.recalc_invoice_totals(coalesce(NEW.invoice_id, OLD.invoice_id));
  end if;

  return coalesce(NEW, OLD);
end;
$$;

-- `revoke ... from public` alone is not enough -- see the comment on
-- recalc_invoice_totals in 20260814120100_billing_generation.sql. Trigger
-- functions are invoked by the system when their trigger fires, not
-- directly by a REST caller's role, so they need no EXECUTE grant on the
-- firing user at all -- revoking every REST role here keeps this airtight
-- the same way the other internal-only functions in this module are.
revoke all on function public.trg_recalc_invoice_totals() from public, anon, authenticated, service_role;

-- charges.invoice_id is nullable (set null on invoice delete), so both
-- INSERT and the invoice_id-changed UPDATE branch above are reachable here.
create trigger charges_recalc_invoice_totals
  after insert or update or delete on public.charges
  for each row execute function public.trg_recalc_invoice_totals();

-- payments.invoice_id is not null, but the trigger function's coalesce
-- form is kept uniform across both tables rather than special-cased.
create trigger payments_recalc_invoice_totals
  after insert or update or delete on public.payments
  for each row execute function public.trg_recalc_invoice_totals();


-- ============================================================================
-- SECTION 5 — 20260814120400_child_roster_view.sql
-- ============================================================================

-- Money Module fix round 1 (Task 10, Critical 1): staff cannot read
-- public.children directly -- children_select (20260802224828_children_and
-- _guardians.sql) restricts select to director/platform_admin. Both staff
-- billing surfaces added in Task 10 (the /children roster and the
-- /children/[childId] card) queried public.children directly, so under RLS
-- they silently returned nothing: an always-empty roster and a 404 for
-- every child, for every staff user.
--
-- Controller Ruling K: do not relax children_select to admit staff -- that
-- would also hand staff weekly_rate, subsidy_weekly_amount, funding_type,
-- and rate_note, breaking the no-amounts rule the staff surface exists to
-- enforce. Instead extend the existing staff-safe child_balance_status view
-- (20260814120200_billing_balance_view.sql) with only the roster columns
-- staff actually need to render name + classroom + location + balance
-- badge, reusing the same security_invoker = false / explicit
-- `where c.tenant_id = public.current_tenant_id()` mechanism already proven
-- safe for balance_status.
--
-- Postgres requires CREATE OR REPLACE VIEW to keep pre-existing output
-- columns in their original names/order/types and only append new columns
-- at the end -- so child_id, tenant_id, balance_status stay first and in
-- place; full_name/classroom/location_name are appended after them.
--
-- This is a NEW file (not an edit to 20260814120200) using
-- `create or replace view`: Supabase will not re-apply an already-applied
-- migration version, and whether 20260814120200 has been applied to the
-- live database yet is unknown from here. A new file with
-- `create or replace` is correct either way.
create or replace view public.child_balance_status
with (security_invoker = false)
as
select
  c.id as child_id,
  c.tenant_id,
  case
    when exists (
      select 1
      from public.charges ch
      join public.invoices i on i.id = ch.invoice_id
      where ch.child_id = c.id
        and ch.void = false
        and i.status in ('open', 'partial')
        and i.due_date < current_date
    ) then 'overdue'
    else 'current'
  end as balance_status,
  c.full_name,
  c.classroom,
  l.name as location_name
from public.children c
left join public.locations l on l.id = c.location_id
where c.tenant_id = public.current_tenant_id();

-- `create or replace view` does not reliably preserve security_barrier or
-- prior grants/revokes -- restate all three so this migration is correct
-- standalone, regardless of what has already run against the database.
alter view public.child_balance_status set (security_barrier = true);

revoke all on public.child_balance_status from public, anon;
grant select on public.child_balance_status to authenticated;


-- ============================================================================
-- SECTION 6 — 20260814120500_roster_location_scope.sql
-- ============================================================================

-- Money Module final-review fix (Important 4): child_balance_status was
-- scoped to tenant only, not location. Spec §135 says the staff-visible
-- balance view is "scoped to their tenant/location", but neither
-- 20260814120200_billing_balance_view.sql nor
-- 20260814120400_child_roster_view.sql added a location predicate, so any
-- staff member -- even one assigned to a single site -- could read every
-- child's balance status and roster info (full_name/classroom/location_name)
-- across every location in the tenant. The repo already has
-- public.has_location_access() (20260802141909_rls_policies.sql) and uses it
-- for exactly this purpose on incident_reports
-- (20260802232600_incident_reports_and_sops.sql:55).
--
-- This is a NEW file (not an edit to 20260814120400), same reasoning as that
-- migration's own header comment: Supabase will not re-apply an
-- already-applied migration version, and `create or replace view` cannot
-- rename, reorder, or retype existing columns -- it can only be restated in
-- full with the same six columns (child_id, tenant_id, balance_status,
-- full_name, classroom, location_name), in that exact order, with the
-- location predicate added to the where clause.
create or replace view public.child_balance_status
with (security_invoker = false)
as
select
  c.id as child_id,
  c.tenant_id,
  case
    when exists (
      select 1
      from public.charges ch
      join public.invoices i on i.id = ch.invoice_id
      where ch.child_id = c.id
        and ch.void = false
        and i.status in ('open', 'partial')
        and i.due_date < current_date
    ) then 'overdue'
    else 'current'
  end as balance_status,
  c.full_name,
  c.classroom,
  l.name as location_name
from public.children c
left join public.locations l on l.id = c.location_id
where c.tenant_id = public.current_tenant_id()
  and (
    public.current_role() in ('director', 'platform_admin')
    or public.has_location_access(c.location_id)
  );

-- `create or replace view` does not reliably preserve security_barrier or
-- prior grants/revokes -- restate all three so this migration is correct
-- standalone, regardless of what has already run against the database.
alter view public.child_balance_status set (security_barrier = true);

revoke all on public.child_balance_status from public, anon;
grant select on public.child_balance_status to authenticated;


-- ============================================================================
-- SECTION 7 — 20260814120600_overpayment_credits.sql
-- ============================================================================

-- Overpayment credits (spec §91/§141): an overpayment on an invoice should
-- become a family-level credit charge carried onto the guardian's next
-- invoice, rather than a negative invoice balance or an invisible excess.
-- Extends the `charges` table from 20260814120000_billing_engine.sql. This
-- is a NEW file, not an edit to that migration -- Supabase will not
-- re-apply an already-applied version, and whether it has been applied to
-- the live database yet is unknown from here.
--
-- An overpayment belongs to the paying guardian (the family), not to any
-- one child -- a family with three enrolled children who overpays hasn't
-- overpaid on behalf of one specific child. `charges.child_id` was
-- `not null`, modeling every charge as child-scoped; that assumption no
-- longer holds once a charge can be family-level, so it's relaxed here
-- rather than forcing a family credit to point at an arbitrary child.

alter table public.charges
  add column guardian_id uuid references public.guardians (id) on delete cascade;

-- Relaxing NOT NULL is safe on live data -- it only widens what's allowed,
-- it can't invalidate any existing row.
alter table public.charges
  alter column child_id drop not null;

-- The overpaid invoice this credit was generated from. Lets the invoice
-- detail page answer "has a credit already been applied to this specific
-- overpayment" and lets a director trace a credit back to its source,
-- without a fragile description-string match.
alter table public.charges
  add column source_invoice_id uuid references public.invoices (id) on delete set null;

-- Every charge belongs to a child (ordinary tuition/fee/adjustment/credit)
-- or a guardian (a family-level overpayment credit) -- never neither, or a
-- charge would be unattributable to anyone's balance at all.
alter table public.charges
  add constraint charges_child_or_guardian
  check (child_id is not null or guardian_id is not null);

-- Idempotency for the credit itself: at most one live (non-void) credit per
-- source invoice, so a double click on "Apply credit" -- or any other
-- concurrent insert attempt against the same overpaid invoice -- cannot
-- double-credit the family. Partial on `type = 'credit' and void = false`
-- so voiding a mistaken credit and issuing a corrected one (the spec's only
-- correction mechanism: void + a new row, never a hard delete) is never
-- blocked by the old, now-voided row.
create unique index charges_source_invoice_key
  on public.charges (source_invoice_id)
  where type = 'credit' and void = false;

-- The generator's per-run lookup of "does this guardian have any pending
-- (unattached) credits" scans by guardian_id -- see
-- 20260814120700_attach_pending_credits.sql.
create index charges_guardian_id_idx on public.charges (guardian_id);


-- ============================================================================
-- SECTION 8 — 20260814120700_attach_pending_credits.sql
-- ============================================================================

-- Overpayment credits, part 2 (spec §91/§141): once
-- 20260814120600_overpayment_credits.sql lets a credit charge exist
-- unattached (invoice_id null, guardian_id set), something has to carry it
-- forward onto the guardian's next invoice -- that's this migration.
--
-- Postgres cannot change a function's signature via `create or replace
-- function` (return type, parameter list, etc. must match exactly, or it
-- errors), so the only way to add a step in the middle of
-- generate_recurring_charges_impl's existing logic is to reproduce the
-- whole function body here with the addition folded in, preserving its
-- exact signature, `security definer`, and `set search_path = public`.
-- This is a NEW file (not an edit to 20260814120100_billing_generation.sql)
-- for the same reason as that file's own child_roster_view.sql precedent:
-- Supabase will not re-apply an already-applied migration version, and
-- whether 20260814120100 has been applied to the live database yet is
-- unknown from here. `create or replace` is correct either way.
--
-- The only change from the version in 20260814120100_billing_generation.sql
-- is the new "attach pending credits" block below, placed right after
-- v_invoice_id is finally resolved (post unique_violation recovery) and
-- right before the existing `perform public.recalc_invoice_totals(...)`
-- call, so total_amount picks up both the new tuition charge and any
-- attached credits in one recalc pass. Everything else is byte-for-byte the
-- same as the version this replaces.
create or replace function public.generate_recurring_charges_impl(
  p_tenant_id uuid,
  p_on date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child record;
  v_period_start date;
  v_period_end date;
  v_first_monday date;
  v_third_monday date;
  v_next_first_monday date;
  v_fraction numeric;
  v_total_days integer;
  v_billed_days integer;
  v_subsidy numeric(10, 2);
  v_parent numeric(10, 2);
  v_period_rate numeric(10, 2);
  v_guardian_id uuid;
  v_invoice_id uuid;
  v_new_invoice boolean;
  v_created integer := 0;
begin
  -- Period boundaries per cadence, mirroring src/lib/billing/periods.ts.
  v_first_monday := date_trunc('month', p_on)::date
    + ((8 - extract(dow from date_trunc('month', p_on))::integer) % 7);
  v_third_monday := v_first_monday + 14;
  v_next_first_monday := (date_trunc('month', p_on) + interval '1 month')::date
    + ((8 - extract(dow from (date_trunc('month', p_on) + interval '1 month'))::integer) % 7);

  for v_child in
    select c.id, c.location_id, c.weekly_rate, c.subsidy_weekly_amount,
           c.cadence, c.funding_type, c.start_date
    from public.children c
    where c.tenant_id = p_tenant_id
      and c.status = 'active'
      and c.weekly_rate is not null
  loop
    v_period_start := null;
    v_period_end := null;

    if v_child.cadence = 'monthly' then
      if extract(day from p_on) = 1 then
        v_period_start := p_on;
        v_period_end := (date_trunc('month', p_on) + interval '1 month' - interval '1 day')::date;
        v_period_rate := v_child.weekly_rate * 52 / 12;
      end if;

    elsif v_child.cadence = 'weekly' then
      if extract(dow from p_on) = 1 then
        v_period_start := p_on;
        v_period_end := p_on + 6;
        v_period_rate := v_child.weekly_rate;
      end if;

    elsif v_child.cadence = 'biweekly' then
      if p_on = v_first_monday then
        v_period_start := p_on;
        v_period_end := v_third_monday - 1;
        v_period_rate := v_child.weekly_rate * 2;
      elsif p_on = v_third_monday then
        v_period_start := p_on;
        v_period_end := v_next_first_monday - 1;
        v_period_rate := v_child.weekly_rate * 2;
      end if;
    end if;

    continue when v_period_start is null;

    -- Skip children who haven't started yet as of this period's end.
    continue when v_child.start_date is not null and v_child.start_date > v_period_end;

    -- Prorate the first period if enrollment lands mid-period.
    v_fraction := 1;
    if v_child.start_date is not null and v_child.start_date > v_period_start then
      v_total_days := (v_period_end - v_period_start) + 1;
      v_billed_days := (v_period_end - v_child.start_date) + 1;
      v_fraction := round(v_billed_days::numeric / v_total_days::numeric, 4);
    end if;

    -- Split subsidy vs parent copay. Private-pay children carry no subsidy.
    -- weekly_rate is filtered not null above but can legitimately be 0;
    -- nullif guards the division so a zero rate can't raise
    -- division_by_zero and abort the whole run, and coalesce folds the
    -- resulting null back to 0 so the not-null subsidy_amount column holds.
    if v_child.funding_type = 'private' or v_child.subsidy_weekly_amount is null then
      v_subsidy := 0;
      -- weekly_rate carries no >= 0 check (children already holds live
      -- production data that might violate one, so ruling out that
      -- constraint deliberately -- see round-1 report). A negative rate
      -- would otherwise produce a negative parent_amount here and trip
      -- charges_tuition_parent_amount_non_negative as a check_violation,
      -- which -- unlike unique_violation below -- is never caught, so it
      -- would escape this function, escape run_daily_billing's tenant
      -- loop, and abort the nightly run for every remaining tenant.
      v_parent := greatest(round(v_period_rate * v_fraction, 2), 0);
    else
      v_subsidy := coalesce(round(
        (v_child.subsidy_weekly_amount * (v_period_rate / nullif(v_child.weekly_rate, 0))) * v_fraction, 2), 0);
      -- subsidy_weekly_amount carries no check against weekly_rate, so a
      -- data-entry error (subsidy > rate) must not push parent_amount
      -- negative and silently shrink the family's invoice. Clamp subsidy to
      -- the period amount so subsidy_amount + parent_amount always sums to
      -- the period total, and parent_amount never goes below 0. Also floor
      -- subsidy itself at 0: a negative subsidy_weekly_amount (another
      -- data-entry error, no check constraint on that column either) would
      -- otherwise pass the upper clamp and break the sum invariant the
      -- other direction (parent_amount > the period rate). The
      -- charges_tuition_parent_amount_non_negative constraint backstops
      -- parent_amount for any other insert path, but weekly_rate can also
      -- be negative -- see the comment in the private-pay branch above --
      -- so parent_amount is floored at 0 here too.
      v_subsidy := greatest(least(v_subsidy, round(v_period_rate * v_fraction, 2)), 0);
      v_parent := greatest(round(v_period_rate * v_fraction, 2) - v_subsidy, 0);
    end if;

    -- The payer guardian groups the invoice. Skip children with no payer set.
    select cg.guardian_id into v_guardian_id
    from public.child_guardians cg
    where cg.child_id = v_child.id and cg.is_payer = true
    limit 1;

    continue when v_guardian_id is null;

    -- Reuse this guardian's invoice for the period, or open one. tenant_id
    -- is redundant with guardian_id (a guardian belongs to one tenant) but
    -- scoped here anyway for defense in depth.
    select i.id into v_invoice_id
    from public.invoices i
    where i.tenant_id = p_tenant_id
      and i.guardian_id = v_guardian_id
      and i.period_start = v_period_start
      and i.period_end = v_period_end
      and i.status <> 'void'
    limit 1;

    v_new_invoice := false;

    if v_invoice_id is null then
      -- on conflict guards against a concurrent cron run and a director's
      -- "Generate now" click racing to open the same guardian+period
      -- invoice, which would otherwise hit invoices_guardian_period_key and
      -- abort the whole generation run for every remaining child.
      insert into public.invoices (
        tenant_id, location_id, guardian_id, period_start, period_end, due_date
      )
      values (
        p_tenant_id, v_child.location_id, v_guardian_id, v_period_start, v_period_end,
        -- Uniform 7-day offset for every cadence, by design -- per-cadence
        -- due dates (e.g. a longer grace window for monthly invoices) are an
        -- explicit spec non-goal, not an oversight. Revisit here if that
        -- ever changes.
        v_period_start + 7
      )
      on conflict (guardian_id, period_start, period_end) where status <> 'void'
      do nothing
      returning id into v_invoice_id;

      if v_invoice_id is null then
        -- Lost the race; pick up the invoice the concurrent run created.
        select i.id into v_invoice_id
        from public.invoices i
        where i.tenant_id = p_tenant_id
          and i.guardian_id = v_guardian_id
          and i.period_start = v_period_start
          and i.period_end = v_period_end
          and i.status <> 'void'
        limit 1;
      else
        v_new_invoice := true;
      end if;
    end if;

    begin
      insert into public.charges (
        tenant_id, location_id, child_id, invoice_id, type,
        period_start, period_end, description, subsidy_amount, parent_amount
      )
      values (
        p_tenant_id, v_child.location_id, v_child.id, v_invoice_id, 'tuition',
        v_period_start, v_period_end,
        'Tuition ' || to_char(v_period_start, 'Mon DD') || ' – ' || to_char(v_period_end, 'Mon DD'),
        v_subsidy, v_parent
      );
      v_created := v_created + 1;
    exception when unique_violation then
      -- Already charged for this period -- e.g. this guardian's invoice for
      -- the period was voided and a fresh one just opened above, but the
      -- tuition charge itself was never voided, so
      -- charges_tuition_period_key still blocks re-insertion. Leave the
      -- existing charge alone, and if we just opened a brand-new invoice
      -- for this attempt, delete it so it doesn't linger as an empty,
      -- perpetually-regenerated $0 open invoice.
      if v_new_invoice then
        delete from public.invoices where id = v_invoice_id;
        v_invoice_id := null;
      end if;
    end;

    -- New: attach any pending (unattached) family credits for this guardian
    -- to the invoice just resolved above. A credit is created unattached
    -- (invoice_id null, guardian_id set) by the app's
    -- applyOverpaymentCredit action -- this generator run is what "carries
    -- it forward" onto the family's next invoice, per spec §91/§141.
    -- Scoped to this guardian/tenant and type = 'credit'/void = false, so it
    -- can never touch another guardian's credit or re-touch an
    -- already-attached or voided one. If v_invoice_id ended up null above
    -- (the unique_violation recovery path deleted a just-created, now-empty
    -- invoice), there is nothing to attach to yet -- the credit stays
    -- pending for the next run, same as before this insert attempt. The
    -- charges_recalc_invoice_totals trigger also fires on this UPDATE; that
    -- is harmless and idempotent (recalc runs again, unconditionally, right
    -- below), and lets total_amount pick up both the new tuition charge and
    -- any attached credits in a single settled pass.
    if v_invoice_id is not null then
      update public.charges
      set invoice_id = v_invoice_id
      where guardian_id = v_guardian_id
        and tenant_id = p_tenant_id
        and type = 'credit'
        and void = false
        and invoice_id is null;
    end if;

    if v_invoice_id is not null then
      perform public.recalc_invoice_totals(v_invoice_id);
    end if;
  end loop;

  return v_created;
end;
$$;

-- `create or replace function` preserves existing grants, but Supabase's
-- default schema privileges grant EXECUTE directly to anon/authenticated/
-- service_role at function-creation time, independent of the PUBLIC
-- pseudo-role -- `revoke ... from public` alone is not enough (see the
-- comment on recalc_invoice_totals in 20260814120100_billing_generation.sql,
-- and the pin_login.sql precedent -- an earlier round of this project
-- shipped a security hole by getting exactly this wrong). Restating the
-- revoke here, exactly as the original migration does, makes this file
-- self-evidently correct standalone rather than relying on
-- "create or replace preserves grants" being read and trusted by whoever
-- applies migrations next.
revoke all on function public.generate_recurring_charges_impl(uuid, date) from public, anon, authenticated, service_role;


-- ============================================================================
-- SECTION 9 — 20260814120800_guard_paid_invoice_credit_attach.sql
-- ============================================================================

-- Overpayment credits, fix round 1 (Important): the credit-attach block
-- added in 20260814120700_attach_pending_credits.sql fires on ANY invoice
-- generate_recurring_charges_impl resolves for the guardian -- including a
-- pre-existing invoice that has already been paid in full, not just a
-- freshly-opened one.
--
-- Concrete double-credit path this closes: a director clicks "Generate now"
-- mid-period after a family has already paid in full. Invoice B is
-- total_amount 400 / amount_paid 400 (status 'paid'). The guardian has a
-- pending -100 credit from an earlier, unrelated overpayment. The old
-- attach block would UPDATE that credit onto invoice B: total_amount drops
-- to 300 while amount_paid stays 400 -- invoice B is now itself overpaid by
-- 100, and /billing/[invoiceId] offers "Apply $100.00 as a credit" on B.
-- Because B has a different id, charges_source_invoice_key (scoped to
-- source_invoice_id) does not block a second credit from that click -- the
-- family would be credited twice for one overpayment.
--
-- Fix: only attach a pending credit to an invoice that has not been paid
-- against at all (amount_paid = 0). A generation run that finds an
-- EXISTING but still-unpaid invoice should still legitimately attach the
-- credit there -- so the guard checks the target invoice's amount_paid
-- directly, not `v_new_invoice` (which would wrongly skip that legitimate
-- case and leave the credit pending forever on a guardian who simply
-- hasn't paid the new invoice yet).
--
-- Same reproduction approach as 20260814120700: Postgres cannot change a
-- function's signature via `create or replace function`, so this is a full
-- reproduction of generate_recurring_charges_impl in a NEW migration
-- (Supabase will not re-apply an already-applied version, and whether
-- 20260814120700 has been applied to the live database yet is unknown from
-- here), with only the attach block's WHERE clause changed. Everything else
-- is byte-for-byte the same as the version this replaces.
create or replace function public.generate_recurring_charges_impl(
  p_tenant_id uuid,
  p_on date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child record;
  v_period_start date;
  v_period_end date;
  v_first_monday date;
  v_third_monday date;
  v_next_first_monday date;
  v_fraction numeric;
  v_total_days integer;
  v_billed_days integer;
  v_subsidy numeric(10, 2);
  v_parent numeric(10, 2);
  v_period_rate numeric(10, 2);
  v_guardian_id uuid;
  v_invoice_id uuid;
  v_new_invoice boolean;
  v_created integer := 0;
begin
  -- Period boundaries per cadence, mirroring src/lib/billing/periods.ts.
  v_first_monday := date_trunc('month', p_on)::date
    + ((8 - extract(dow from date_trunc('month', p_on))::integer) % 7);
  v_third_monday := v_first_monday + 14;
  v_next_first_monday := (date_trunc('month', p_on) + interval '1 month')::date
    + ((8 - extract(dow from (date_trunc('month', p_on) + interval '1 month'))::integer) % 7);

  for v_child in
    select c.id, c.location_id, c.weekly_rate, c.subsidy_weekly_amount,
           c.cadence, c.funding_type, c.start_date
    from public.children c
    where c.tenant_id = p_tenant_id
      and c.status = 'active'
      and c.weekly_rate is not null
  loop
    v_period_start := null;
    v_period_end := null;

    if v_child.cadence = 'monthly' then
      if extract(day from p_on) = 1 then
        v_period_start := p_on;
        v_period_end := (date_trunc('month', p_on) + interval '1 month' - interval '1 day')::date;
        v_period_rate := v_child.weekly_rate * 52 / 12;
      end if;

    elsif v_child.cadence = 'weekly' then
      if extract(dow from p_on) = 1 then
        v_period_start := p_on;
        v_period_end := p_on + 6;
        v_period_rate := v_child.weekly_rate;
      end if;

    elsif v_child.cadence = 'biweekly' then
      if p_on = v_first_monday then
        v_period_start := p_on;
        v_period_end := v_third_monday - 1;
        v_period_rate := v_child.weekly_rate * 2;
      elsif p_on = v_third_monday then
        v_period_start := p_on;
        v_period_end := v_next_first_monday - 1;
        v_period_rate := v_child.weekly_rate * 2;
      end if;
    end if;

    continue when v_period_start is null;

    -- Skip children who haven't started yet as of this period's end.
    continue when v_child.start_date is not null and v_child.start_date > v_period_end;

    -- Prorate the first period if enrollment lands mid-period.
    v_fraction := 1;
    if v_child.start_date is not null and v_child.start_date > v_period_start then
      v_total_days := (v_period_end - v_period_start) + 1;
      v_billed_days := (v_period_end - v_child.start_date) + 1;
      v_fraction := round(v_billed_days::numeric / v_total_days::numeric, 4);
    end if;

    -- Split subsidy vs parent copay. Private-pay children carry no subsidy.
    -- weekly_rate is filtered not null above but can legitimately be 0;
    -- nullif guards the division so a zero rate can't raise
    -- division_by_zero and abort the whole run, and coalesce folds the
    -- resulting null back to 0 so the not-null subsidy_amount column holds.
    if v_child.funding_type = 'private' or v_child.subsidy_weekly_amount is null then
      v_subsidy := 0;
      -- weekly_rate carries no >= 0 check (children already holds live
      -- production data that might violate one, so ruling out that
      -- constraint deliberately -- see round-1 report). A negative rate
      -- would otherwise produce a negative parent_amount here and trip
      -- charges_tuition_parent_amount_non_negative as a check_violation,
      -- which -- unlike unique_violation below -- is never caught, so it
      -- would escape this function, escape run_daily_billing's tenant
      -- loop, and abort the nightly run for every remaining tenant.
      v_parent := greatest(round(v_period_rate * v_fraction, 2), 0);
    else
      v_subsidy := coalesce(round(
        (v_child.subsidy_weekly_amount * (v_period_rate / nullif(v_child.weekly_rate, 0))) * v_fraction, 2), 0);
      -- subsidy_weekly_amount carries no check against weekly_rate, so a
      -- data-entry error (subsidy > rate) must not push parent_amount
      -- negative and silently shrink the family's invoice. Clamp subsidy to
      -- the period amount so subsidy_amount + parent_amount always sums to
      -- the period total, and parent_amount never goes below 0. Also floor
      -- subsidy itself at 0: a negative subsidy_weekly_amount (another
      -- data-entry error, no check constraint on that column either) would
      -- otherwise pass the upper clamp and break the sum invariant the
      -- other direction (parent_amount > the period rate). The
      -- charges_tuition_parent_amount_non_negative constraint backstops
      -- parent_amount for any other insert path, but weekly_rate can also
      -- be negative -- see the comment in the private-pay branch above --
      -- so parent_amount is floored at 0 here too.
      v_subsidy := greatest(least(v_subsidy, round(v_period_rate * v_fraction, 2)), 0);
      v_parent := greatest(round(v_period_rate * v_fraction, 2) - v_subsidy, 0);
    end if;

    -- The payer guardian groups the invoice. Skip children with no payer set.
    select cg.guardian_id into v_guardian_id
    from public.child_guardians cg
    where cg.child_id = v_child.id and cg.is_payer = true
    limit 1;

    continue when v_guardian_id is null;

    -- Reuse this guardian's invoice for the period, or open one. tenant_id
    -- is redundant with guardian_id (a guardian belongs to one tenant) but
    -- scoped here anyway for defense in depth.
    select i.id into v_invoice_id
    from public.invoices i
    where i.tenant_id = p_tenant_id
      and i.guardian_id = v_guardian_id
      and i.period_start = v_period_start
      and i.period_end = v_period_end
      and i.status <> 'void'
    limit 1;

    v_new_invoice := false;

    if v_invoice_id is null then
      -- on conflict guards against a concurrent cron run and a director's
      -- "Generate now" click racing to open the same guardian+period
      -- invoice, which would otherwise hit invoices_guardian_period_key and
      -- abort the whole generation run for every remaining child.
      insert into public.invoices (
        tenant_id, location_id, guardian_id, period_start, period_end, due_date
      )
      values (
        p_tenant_id, v_child.location_id, v_guardian_id, v_period_start, v_period_end,
        -- Uniform 7-day offset for every cadence, by design -- per-cadence
        -- due dates (e.g. a longer grace window for monthly invoices) are an
        -- explicit spec non-goal, not an oversight. Revisit here if that
        -- ever changes.
        v_period_start + 7
      )
      on conflict (guardian_id, period_start, period_end) where status <> 'void'
      do nothing
      returning id into v_invoice_id;

      if v_invoice_id is null then
        -- Lost the race; pick up the invoice the concurrent run created.
        select i.id into v_invoice_id
        from public.invoices i
        where i.tenant_id = p_tenant_id
          and i.guardian_id = v_guardian_id
          and i.period_start = v_period_start
          and i.period_end = v_period_end
          and i.status <> 'void'
        limit 1;
      else
        v_new_invoice := true;
      end if;
    end if;

    begin
      insert into public.charges (
        tenant_id, location_id, child_id, invoice_id, type,
        period_start, period_end, description, subsidy_amount, parent_amount
      )
      values (
        p_tenant_id, v_child.location_id, v_child.id, v_invoice_id, 'tuition',
        v_period_start, v_period_end,
        'Tuition ' || to_char(v_period_start, 'Mon DD') || ' – ' || to_char(v_period_end, 'Mon DD'),
        v_subsidy, v_parent
      );
      v_created := v_created + 1;
    exception when unique_violation then
      -- Already charged for this period -- e.g. this guardian's invoice for
      -- the period was voided and a fresh one just opened above, but the
      -- tuition charge itself was never voided, so
      -- charges_tuition_period_key still blocks re-insertion. Leave the
      -- existing charge alone, and if we just opened a brand-new invoice
      -- for this attempt, delete it so it doesn't linger as an empty,
      -- perpetually-regenerated $0 open invoice.
      if v_new_invoice then
        delete from public.invoices where id = v_invoice_id;
        v_invoice_id := null;
      end if;
    end;

    -- Attach any pending (unattached) family credits for this guardian to
    -- the invoice just resolved above -- but ONLY if that invoice has not
    -- been paid against at all (amount_paid = 0). Fix round 1, Important:
    -- attaching a credit to an invoice that already has money applied to it
    -- -- even a pre-existing, untouched-this-run invoice reused above, not
    -- just a brand-new one -- drops that invoice's total_amount out from
    -- under its existing amount_paid and creates a FRESH overpayment on it,
    -- which the app would then let a director credit again
    -- (charges_source_invoice_key only dedupes per source_invoice_id, and
    -- this second overpayment has a different source invoice than the
    -- first). That is a double-credit of the same money. Checking
    -- amount_paid = 0 (not v_new_invoice) is deliberate: a generation run
    -- that finds an EXISTING but still-entirely-unpaid invoice should still
    -- legitimately attach the credit there -- v_new_invoice would wrongly
    -- skip that legitimate case too. Do not remove this guard.
    --
    -- A credit is created unattached (invoice_id null, guardian_id set) by
    -- the app's applyOverpaymentCredit action -- this generator run is what
    -- "carries it forward" onto the family's next invoice, per spec
    -- §91/§141. Scoped to this guardian/tenant and type = 'credit'/
    -- void = false, so it can never touch another guardian's credit or
    -- re-touch an already-attached or voided one. If v_invoice_id ended up
    -- null above (the unique_violation recovery path deleted a
    -- just-created, now-empty invoice), there is nothing to attach to yet
    -- -- the credit stays pending for the next run, same as before this
    -- insert attempt. The charges_recalc_invoice_totals trigger also fires
    -- on this UPDATE; that is harmless and idempotent (recalc runs again,
    -- unconditionally, right below), and lets total_amount pick up both the
    -- new tuition charge and any attached credits in a single settled pass.
    if v_invoice_id is not null then
      update public.charges
      set invoice_id = v_invoice_id
      where guardian_id = v_guardian_id
        and tenant_id = p_tenant_id
        and type = 'credit'
        and void = false
        and invoice_id is null
        and exists (
          select 1 from public.invoices i
          where i.id = v_invoice_id and i.amount_paid = 0
        );
    end if;

    if v_invoice_id is not null then
      perform public.recalc_invoice_totals(v_invoice_id);
    end if;
  end loop;

  return v_created;
end;
$$;

-- `create or replace function` preserves existing grants, but Supabase's
-- default schema privileges grant EXECUTE directly to anon/authenticated/
-- service_role at function-creation time, independent of the PUBLIC
-- pseudo-role -- `revoke ... from public` alone is not enough (see the
-- comment on recalc_invoice_totals in 20260814120100_billing_generation.sql,
-- and the pin_login.sql precedent -- an earlier round of this project
-- shipped a security hole by getting exactly this wrong). Restating the
-- revoke here, exactly as the original migration does, makes this file
-- self-evidently correct standalone rather than relying on
-- "create or replace preserves grants" being read and trusted by whoever
-- applies migrations next.
revoke all on function public.generate_recurring_charges_impl(uuid, date) from public, anon, authenticated, service_role;


-- ============================================================================
-- SECTION 10 — 20260815120000_rooms_capacity_and_waitlist.sql
-- ============================================================================

-- Rooms foundation for the capacity-aware waitlist, and the shared base that
-- ratio tracking will reuse (children.room_id + the room age band, joined
-- against room_transfers for staff presence).
--
-- Deliberately additive. children.classroom is free text on live records and
-- this project has no database access to inspect it, so nothing here reads,
-- matches, or migrates those values: room_id is nullable with no backfill and
-- classroom is retained untouched. Directors assign rooms through the UI.

-- ── rooms: capacity + age band ───────────────────────────────────────────
-- All nullable so this cannot fail against existing rows, and so capacity can
-- be adopted per room at the director's pace. The age band is unused by the
-- waitlist beyond suggesting a room; it exists because ratio tracking needs
-- it and a second migration for one column would be waste.
alter table public.rooms
  add column capacity integer,
  add column min_age_months integer,
  add column max_age_months integer;

alter table public.rooms
  add constraint rooms_capacity_positive
    check (capacity is null or capacity > 0),
  add constraint rooms_min_age_non_negative
    check (min_age_months is null or min_age_months >= 0),
  add constraint rooms_max_age_non_negative
    check (max_age_months is null or max_age_months >= 0),
  add constraint rooms_age_band_ordered
    check (
      min_age_months is null
      or max_age_months is null
      or min_age_months <= max_age_months
    );

-- ── children: room assignment + waitlist dates ───────────────────────────
-- on delete set null, never cascade: deleting a room must not delete children.
alter table public.children
  add column room_id uuid references public.rooms (id) on delete set null,
  add column waitlisted_at date,
  add column desired_start_date date;

comment on column public.children.classroom is
  'Legacy free-text room name. Superseded by room_id; retained until every child is assigned and never auto-migrated.';
comment on column public.children.waitlisted_at is
  'When the family joined the waitlist queue. Ordering key for /waitlist. Distinct from created_at (record creation).';
comment on column public.children.desired_start_date is
  'When the family asked to start. Distinct from start_date (when enrollment actually began, which billing prorates from). Retained after enrollment.';

create index children_room_id_idx on public.children (room_id);

-- Partial: the waitlist screen only ever reads waitlisted rows, and enrolling
-- flips status to 'active' so the row leaves this index.
create index children_waitlist_idx
  on public.children (tenant_id, waitlisted_at)
  where status = 'waitlisted';

-- No new RLS policies. children keeps its director/platform_admin-only
-- policies from 20260802224828; rooms keeps rooms_select (tenant-wide, so
-- staff can already read room names for the kiosk) and rooms_write
-- (director/platform_admin) from 20260813090000.


-- ============================================================================
-- STEP 11 — POST-APPLY SMOKE CHECK. Run after all ten sections succeed.
-- ============================================================================
select
  to_regclass('public.charges')              is not null as charges_ok,
  to_regclass('public.invoices')             is not null as invoices_ok,
  to_regclass('public.payments')             is not null as payments_ok,
  to_regclass('public.child_balance_status') is not null as balance_view_ok,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='children'
       and column_name in ('subsidy_weekly_amount','room_id','waitlisted_at','desired_start_date')) = 4
                                                          as children_cols_ok,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='rooms'
       and column_name in ('capacity','min_age_months','max_age_months')) = 3
                                                          as rooms_cols_ok,
  (select count(*) from cron.job where jobname='daily-billing') = 1
                                                          as cron_registered;

-- EXPECTED: every column true.

-- Confirm NOTHING was destroyed — every existing child keeps its classroom
-- text and starts with no room assigned (the migrations deliberately do no
-- backfill, because the free-text classroom values were never inspected):
select
  count(*)                                              as total_children,
  count(*) filter (where classroom is not null)         as still_have_classroom,
  count(*) filter (where room_id is null)                as unassigned_to_a_room
from public.children;

-- EXPECTED: still_have_classroom is unchanged from before you started, and
-- unassigned_to_a_room equals total_children.

-- ============================================================================
-- STEP 12 — DRY RUN BEFORE LETTING THE CRON BILL ANYONE.
-- Generates charges inside a transaction, shows you what it WOULD create,
-- then throws it all away. Nothing is kept. Run this before 06:00 UTC.
-- ============================================================================
begin;

  select public.generate_recurring_charges(
    '<YOUR_TENANT_ID>'::uuid,
    date_trunc('week', current_date)::date   -- this week's Monday
  ) as charges_created;

  select c.description, ch.full_name, c.subsidy_amount, c.parent_amount
  from public.charges c
  join public.children ch on ch.id = c.child_id
  order by ch.full_name;

  select g.full_name, i.period_start, i.period_end, i.total_amount, i.status
  from public.invoices i
  join public.guardians g on g.id = i.guardian_id
  order by g.full_name;

rollback;   -- <-- nothing above is kept. Do not change this to commit.

-- Read those two result sets carefully: the amounts, the split between
-- subsidy and parent copay, and one invoice per PAYING guardian (siblings
-- roll up together). If anything looks wrong, stop and report it — the cron
-- will produce exactly this, for real, at 06:00 UTC.
