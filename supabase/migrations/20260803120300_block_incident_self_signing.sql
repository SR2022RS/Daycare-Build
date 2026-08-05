-- Security fix (Codex review): incident_reports_update's comment says
-- "authors cannot edit their own filed report (no self-certification)" but
-- the policy never actually excluded filed_by = auth.uid(), so a
-- site-lead or director who filed an incident could sign off their own
-- report via signIncident(), which relies entirely on this policy for
-- authorization (see src/lib/incidents/actions.ts).

drop policy "incident_reports_update" on public.incident_reports;

create policy "incident_reports_update" on public.incident_reports
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and filed_by <> auth.uid()
    and (
      public.current_role() in ('director', 'platform_admin')
      or (
        public.current_is_site_lead()
        and exists (
          select 1 from public.staff_locations sl
          where sl.staff_id = auth.uid() and sl.location_id = incident_reports.location_id
        )
      )
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and filed_by <> auth.uid()
    and (
      public.current_role() in ('director', 'platform_admin')
      or (
        public.current_is_site_lead()
        and exists (
          select 1 from public.staff_locations sl
          where sl.staff_id = auth.uid() and sl.location_id = incident_reports.location_id
        )
      )
    )
  );
