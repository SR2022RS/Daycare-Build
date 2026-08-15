-- TEST FIXTURE -- not production data. Run in the Supabase SQL Editor after
-- applying supabase/migrations/20260815090000_intensive_registrations.sql.
--
-- Why this exists: the /intensive funnel's post-payment screens read from
-- intensive_registrations, never from Stripe. Stripe's only job is to write
-- that row from the checkout.session.completed webhook. So a row inserted
-- here is indistinguishable from one a real payment would produce, and it
-- exercises the confirmation page and the admin view end to end with no
-- Stripe account attached.
--
-- The teardown at the bottom removes exactly these rows. Run it before you
-- go live so no fake seat is ever counted in real revenue.

insert into public.intensive_registrations
  (tenant_id, first_name, last_name, email, amount_cents, currency, status, checkout_session_id, payment_intent_id, created_at)
values
  -- Use this one to test the confirmation page:
  --   /intensive/confirmed?session_id=cs_test_fixture_danielle_okafor
  ('00000000-0000-0000-0000-000000000001', 'Danielle', 'Okafor', 'd.okafor@example.test',
   30000, 'usd', 'paid', 'cs_test_fixture_danielle_okafor', 'pi_test_fixture_001', now() - interval '11 days'),

  ('00000000-0000-0000-0000-000000000001', 'Marcus', 'Bell', 'marcus.bell@example.test',
   30000, 'usd', 'paid', 'cs_test_fixture_marcus_bell', 'pi_test_fixture_002', now() - interval '10 days'),

  ('00000000-0000-0000-0000-000000000001', 'Yvette', 'Ramirez', 'yvette.ramirez@example.test',
   30000, 'usd', 'paid', 'cs_test_fixture_yvette_ramirez', 'pi_test_fixture_003', now() - interval '8 days'),

  -- Refunded: proves the stat tiles exclude it from revenue and headcount,
  -- and that the grey status pill renders.
  ('00000000-0000-0000-0000-000000000001', 'Robert', 'Nnamdi', 'r.nnamdi@example.test',
   30000, 'usd', 'refunded', 'cs_test_fixture_robert_nnamdi', 'pi_test_fixture_004', now() - interval '5 days'),

  -- Pending: proves /intensive/confirmed refuses to show "you're in" for a
  -- payment that has not actually cleared. Try:
  --   /intensive/confirmed?session_id=cs_test_fixture_alicia_freeman
  ('00000000-0000-0000-0000-000000000001', 'Alicia', 'Freeman', 'alicia.freeman@example.test',
   30000, 'usd', 'pending', 'cs_test_fixture_alicia_freeman', null, now() - interval '2 days')

-- Re-runnable: the unique index on checkout_session_id makes a repeat run a
-- no-op instead of an error.
on conflict (checkout_session_id) do nothing;


-- ── Teardown -- run this to remove every fixture row above ────────────────
-- delete from public.intensive_registrations
--  where checkout_session_id like 'cs_test_fixture_%';
