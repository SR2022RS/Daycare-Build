-- Harden the parent-facing form-fill link before real families use it.
--
-- Token strength: form_sends.token is already `uuid default gen_random_uuid()`
-- -- 122 bits of CSPRNG randomness (36-char canonical form), already well
-- past "32+ chars random" and already scoped to one child + one form set
-- (child_id + form_keys on the same row). No change needed there.
--
-- This migration adds: a 14-day hard expiry, and an access-log table that
-- doubles as (a) the audit trail for every view/submit attempt and (b) the
-- backing store for rate-limiting token-guessing (see lib/forms/access-log.ts).

alter table public.form_sends
  add column expires_at timestamptz not null default (now() + interval '14 days');

create table public.form_send_access_log (
  id uuid primary key default gen_random_uuid(),
  token uuid not null,
  ip text,
  outcome text not null check (outcome in ('viewed', 'not_found', 'expired', 'submitted')),
  created_at timestamptz not null default now()
);

-- Not a foreign key on purpose -- a guessed token that doesn't match any
-- form_sends row still needs to be logged (as 'not_found') so brute-force
-- attempts against nonexistent tokens are counted for rate limiting.
create index form_send_access_log_ip_created_idx on public.form_send_access_log (ip, created_at);
create index form_send_access_log_token_idx on public.form_send_access_log (token);

alter table public.form_send_access_log enable row level security;

-- Written exclusively via the admin client from the public fill route/action
-- (same trust model as child_form_submissions -- no authenticated insert
-- policy at all). Directors can read it as the audit trail.
create policy "form_send_access_log_select" on public.form_send_access_log
  for select to authenticated
  using (
    exists (
      select 1 from public.form_sends fs
      where fs.token = form_send_access_log.token
        and fs.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );
