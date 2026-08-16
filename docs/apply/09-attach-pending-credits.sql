-- STEP 9 of 12 — attach-pending-credits
-- Copy everything in this file, paste into the Supabase SQL editor, click Run.
-- Run this ONCE. If it succeeds, never run it again.

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
