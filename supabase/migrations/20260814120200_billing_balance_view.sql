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

revoke all on public.child_balance_status from public;
grant select on public.child_balance_status to authenticated;
