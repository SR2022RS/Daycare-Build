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

-- security definer + rewrites total_amount/amount_paid/status on an
-- arbitrary invoice_id -- Postgres grants EXECUTE to PUBLIC by default,
-- which PostgREST would otherwise expose as a callable RPC. This is only
-- ever meant to run internally (from generate_recurring_charges_impl below,
-- and future payment-recording code), so no role gets it back.
revoke all on function public.recalc_invoice_totals(uuid) from public;

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
      v_parent := round(v_period_rate * v_fraction, 2);
    else
      v_subsidy := coalesce(round(
        (v_child.subsidy_weekly_amount * (v_period_rate / nullif(v_child.weekly_rate, 0))) * v_fraction, 2), 0);
      -- subsidy_weekly_amount carries no check against weekly_rate, so a
      -- data-entry error (subsidy > rate) must not push parent_amount
      -- negative and silently shrink the family's invoice. Clamp subsidy to
      -- the period amount so subsidy_amount + parent_amount always sums to
      -- the period total, and parent_amount never goes below 0. The
      -- charges_tuition_parent_amount_non_negative constraint backstops
      -- this for any other insert path.
      v_subsidy := least(v_subsidy, round(v_period_rate * v_fraction, 2));
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

-- Internal only: never grant EXECUTE to authenticated (see the comment
-- above the function). Its owner -- this migration's role, which also owns
-- the wrapper below and run_daily_billing -- can still call it, because
-- security definer functions execute with their owner's privileges
-- regardless of grants.
revoke all on function public.generate_recurring_charges_impl(uuid, date) from public;

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

revoke all on function public.generate_recurring_charges(uuid, date) from public;
grant execute on function public.generate_recurring_charges(uuid, date) to authenticated;

-- pg_cron is new here: no prior migration enables it. Runs daily at 06:00 UTC
-- and lets generate_recurring_charges_impl decide whether today actually
-- starts a period for each child's cadence.
create extension if not exists pg_cron with schema extensions;

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

-- Fans out to every tenant with no auth check of its own, so it must never
-- be reachable via PostgREST RPC -- otherwise anon/authenticated could
-- trigger a full, all-tenant billing run on demand. Supabase runs scheduled
-- pg_cron jobs as the role that registered them (this migration's role,
-- which owns this function), not as an API caller, so revoking from public
-- still leaves cron.schedule's invocation working.
revoke all on function public.run_daily_billing() from public;

select cron.schedule(
  'daily-billing',
  '0 6 * * *',
  $$select public.run_daily_billing();$$
);
