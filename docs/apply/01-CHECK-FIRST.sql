-- STEP 1 of 12 — Just a check. This changes NOTHING. Safe to run.
-- Copy everything in this file, paste into the Supabase SQL editor, click Run.

select
  to_regclass('public.tenants')   is not null as has_tenants,
  to_regclass('public.locations') is not null as has_locations,
  to_regclass('public.profiles')  is not null as has_profiles,
  to_regclass('public.children')  is not null as has_children,
  to_regclass('public.guardians') is not null as has_guardians,
  to_regclass('public.rooms')     is not null as has_rooms,
  to_regclass('public.charges')   is null     as billing_not_yet_applied;

-- YOU WANT: every box says true.
--
-- If has_rooms says FALSE  -> STOP. Tell Claude. (A file that creates the
--                             rooms table hasn't been applied yet.)
-- If billing_not_yet_applied says FALSE -> STOP. Tell Claude.
--                             (Some of this is already on the database.)
