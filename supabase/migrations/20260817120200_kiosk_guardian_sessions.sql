-- kiosk_sessions widened for guardian check-in/out. It was staff-only
-- (profile_id not null references profiles), but a guardian who PINs in at
-- the kiosk has no profiles row to put there -- they authenticate through
-- guardian_pins instead. Rather than let the FK force a fake profile,
-- profile_id becomes nullable and a parallel guardian_id is added, exactly
-- the same shape as kiosk_pin_attempts.guardian_id in the previous
-- migration. Exactly one of the two must be set: a kiosk session identifies
-- either a staff member or a guardian, never both and never neither.

alter table public.kiosk_sessions
  alter column profile_id drop not null;

alter table public.kiosk_sessions
  add column guardian_id uuid references public.guardians (id) on delete cascade;

alter table public.kiosk_sessions
  add constraint kiosk_sessions_actor
    check (num_nonnulls(profile_id, guardian_id) = 1);
