-- Security fixes (Codex review):
-- 1. handle_new_user() read `role` from client-controlled signup metadata,
--    so a caller could sign up with role=director/platform_admin via the
--    public Auth API and self-elevate. Self-service signup must always be
--    'staff' -- elevated roles only ever come from a trusted server path
--    (admin-created accounts, or a future invite flow).
-- 2. protect_profile_privileges only locked role/tenant_id, but
--    profiles_update_own allows a staffer to update every other column on
--    their own row -- including is_site_lead, which grants incident
--    sign-off authority. Lock it the same way as role/tenant_id.
-- 3. setSiteLead() (director-only server action) had no RLS policy letting
--    a director update *another* profile at all, so it silently updated
--    zero rows. Add a director/platform_admin-scoped update policy.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, tenant_id, role, full_name, email)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'tenant_id')::uuid,
    'staff',
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email
  );
  return new;
end;
$$;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.role <> old.role or new.tenant_id <> old.tenant_id or new.is_site_lead <> old.is_site_lead)
     and public.current_role() not in ('director', 'platform_admin') then
    new.role := old.role;
    new.tenant_id := old.tenant_id;
    new.is_site_lead := old.is_site_lead;
  end if;
  return new;
end;
$$;

create policy "profiles_update_by_admin" on public.profiles
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));
