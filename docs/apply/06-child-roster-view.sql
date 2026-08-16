-- STEP 6 of 12 — child-roster-view
-- Copy everything in this file, paste into the Supabase SQL editor, click Run.
-- Run this ONCE. If it succeeds, never run it again.

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
