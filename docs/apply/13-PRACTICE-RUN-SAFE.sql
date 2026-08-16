-- STEP 13 — A PRACTICE RUN. Nothing is saved. Do this before 6am UTC.
--
-- This shows you exactly what the automatic billing job WILL charge your
-- families, then throws it away. Nothing is kept. It is safe.
--
-- BEFORE RUNNING: replace  <YOUR_TENANT_ID>  below with your tenant's id.
-- To find it, run this by itself first:
--     select id, name from public.tenants;

begin;

  select public.generate_recurring_charges(
    '<YOUR_TENANT_ID>'::uuid,
    date_trunc('week', current_date)::date
  ) as how_many_charges_it_made;

  -- What each child would be charged:
  select ch.full_name as child, c.description, c.subsidy_amount, c.parent_amount
  from public.charges c
  join public.children ch on ch.id = c.child_id
  order by ch.full_name;

  -- What each family would owe (siblings grouped onto one bill):
  select g.full_name as family, i.period_start, i.period_end, i.total_amount
  from public.invoices i
  join public.guardians g on g.id = i.guardian_id
  order by g.full_name;

rollback;   -- <-- THIS THROWS IT ALL AWAY. Do not change this word.

-- Look at those numbers carefully. Are the amounts right? Is each family
-- billed once, with siblings together? If anything looks wrong, tell Claude
-- BEFORE 6am UTC -- because that is exactly what will be charged for real.
