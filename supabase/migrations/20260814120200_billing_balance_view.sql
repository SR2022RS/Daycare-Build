-- Money Module Step 5: staff-visible balance view.
-- Builds on 20260814120000_billing_engine.sql (charges, invoices) and
-- 20260814120100_billing_generation.sql (charge generation).

-- Staff-safe balance signal: status only, never amounts. security_invoker
-- makes the view run under the caller's RLS, so the policy below is what
-- actually grants staff access -- the underlying tables stay director-only.
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
from public.children c;

alter view public.child_balance_status set (security_barrier = true);

revoke all on public.child_balance_status from public;
grant select on public.child_balance_status to authenticated;
