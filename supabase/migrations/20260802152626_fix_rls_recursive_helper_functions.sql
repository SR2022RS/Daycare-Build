-- Fix infinite RLS recursion: current_tenant_id()/current_role() query
-- profiles, but they're also called from profiles' own RLS policies --
-- evaluating the policy re-invoked the same functions, re-triggering the
-- policy, ad infinitum (Postgres error 54001: stack depth limit exceeded).
--
-- Fix: these two functions take no arguments and only ever look up the
-- calling user's OWN row (id = auth.uid()) -- a user should always be able
-- to resolve their own tenant_id/role regardless of profiles RLS details.
-- Marking them security definer breaks the recursion by bypassing RLS for
-- this narrow, self-scoped lookup only; has_location_access() and every
-- policy that calls them keep running as security invoker.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;
