-- Security fix (Codex review): attendance_write let a staffer write their
-- own clock_in_at/clock_out_at directly via the Supabase API (RLS FOR ALL),
-- bypassing the app's clock-in/out logic and enabling payroll timecard
-- fraud. Staff should only ever get attendance rows through the server
-- actions in src/lib/attendance/actions.ts, which now write via the admin
-- client after their own validation -- so the RLS write policy narrows to
-- director/platform_admin only. Staff keep read access to their own rows.

drop policy "attendance_write" on public.attendance;

create policy "attendance_write_admin" on public.attendance
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));
