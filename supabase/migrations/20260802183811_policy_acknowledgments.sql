-- Policy acknowledgment tracking -- staff attest they've read a policy.
-- Unlike other staff-scoped tables, staff CAN insert their own row here:
-- it's a self-attestation by design, not an HR-managed record. Immutable
-- once created (no update/delete policy) since an attestation shouldn't be
-- editable after the fact.

create table public.policy_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  policy_id uuid not null references public.policies (id) on delete cascade,
  staff_id uuid not null references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (staff_id, policy_id)
);

create index policy_acknowledgments_tenant_id_idx on public.policy_acknowledgments (tenant_id);
create index policy_acknowledgments_policy_id_idx on public.policy_acknowledgments (policy_id);

alter table public.policy_acknowledgments enable row level security;

create policy "policy_acknowledgments_select" on public.policy_acknowledgments
  for select to authenticated
  using (
    staff_id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  );

create policy "policy_acknowledgments_insert_own" on public.policy_acknowledgments
  for insert to authenticated
  with check (
    staff_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.policies p where p.id = policy_acknowledgments.policy_id and p.tenant_id = public.current_tenant_id()
    )
  );
