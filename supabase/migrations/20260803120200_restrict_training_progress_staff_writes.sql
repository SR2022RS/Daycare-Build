-- Security fix (Codex review): staff_training_progress_write let a staffer
-- write their own progress rows directly via the Supabase API (RLS FOR
-- ALL), so they could set status='completed' on a quiz-gated module
-- without passing the quiz -- and that completion write fires
-- sync_training_completion_to_credential_trigger, forging a credential
-- clearance. Completion must only ever be written after the app has
-- computed the quiz result server-side, so staff writes move to the admin
-- client (see src/lib/training/actions.ts) and this policy narrows to
-- director/platform_admin only. Staff keep read access to their own rows.

drop policy "staff_training_progress_write" on public.staff_training_progress;

create policy "staff_training_progress_write_admin" on public.staff_training_progress
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = staff_training_progress.staff_id
        and p.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = staff_training_progress.staff_id
        and p.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );
