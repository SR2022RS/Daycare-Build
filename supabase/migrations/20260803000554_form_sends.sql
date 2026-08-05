-- Fillable child-record forms + the "send to parent" distribution mechanism.
-- Parents have no account, so the fill-out flow is a token-bearing "magic
-- link" (like a password reset link): form_sends.token is the bearer secret,
-- and the public /forms/fill/[token] route validates it server-side before
-- ever touching data -- it does NOT rely on RLS to gate the public write
-- (there is no authenticated user to scope RLS against). Submissions are
-- written via the service-role admin client after the token check passes.
-- Accordingly, child_form_submissions grants no INSERT/UPDATE to
-- `authenticated` at all -- the only write path is the token-gated server
-- action using the admin client, which bypasses RLS by design.

create table public.form_sends (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  form_keys text[] not null,
  token uuid not null default gen_random_uuid(),
  status text not null default 'sent' check (status in ('sent', 'completed', 'expired')),
  sent_by uuid not null references public.profiles (id),
  sent_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (token)
);

create index form_sends_tenant_id_idx on public.form_sends (tenant_id);
create index form_sends_child_id_idx on public.form_sends (child_id);
create index form_sends_token_idx on public.form_sends (token);

alter table public.form_sends enable row level security;

create policy "form_sends_select" on public.form_sends
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "form_sends_insert" on public.form_sends
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and sent_by = auth.uid()
    and public.current_role() in ('director', 'platform_admin')
  );

create table public.child_form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  send_id uuid not null references public.form_sends (id) on delete cascade,
  form_key text not null,
  data jsonb not null,
  submitted_by_name text,
  submitted_at timestamptz not null default now()
);

create index child_form_submissions_tenant_id_idx on public.child_form_submissions (tenant_id);
create index child_form_submissions_child_id_idx on public.child_form_submissions (child_id);
create index child_form_submissions_send_id_idx on public.child_form_submissions (send_id);

alter table public.child_form_submissions enable row level security;

-- Read-only for staff -- no INSERT/UPDATE/DELETE policy for `authenticated`
-- at all. The only write path is the admin client from the token-gated
-- public route (see comment above).
create policy "child_form_submissions_select" on public.child_form_submissions
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));
