-- STEP 12 of 12 — Just checks. This changes NOTHING. Safe to run.

-- A) Did everything get created?
select
  to_regclass('public.charges')              is not null as charges_ok,
  to_regclass('public.invoices')             is not null as invoices_ok,
  to_regclass('public.payments')             is not null as payments_ok,
  to_regclass('public.child_balance_status') is not null as balance_view_ok,
  (select count(*) from cron.job where jobname='daily-billing') = 1 as daily_job_on;

-- YOU WANT: every box says true.


-- B) Did anything get destroyed? (It shouldn't have.)
select
  count(*)                                       as total_children,
  count(*) filter (where classroom is not null)  as still_have_classroom,
  count(*) filter (where room_id is null)        as not_yet_in_a_room
from public.children;

-- YOU WANT: still_have_classroom is the same as before you started,
--           and not_yet_in_a_room equals total_children.
--           (Nobody is assigned to a room yet -- that's on purpose. You'll
--            assign rooms yourself in the app.)
