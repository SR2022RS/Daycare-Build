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
