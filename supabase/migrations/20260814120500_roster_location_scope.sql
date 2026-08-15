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
