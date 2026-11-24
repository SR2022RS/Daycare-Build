-- Child health & allergies.
--
-- Kept off public.children on purpose. That table stays closed to staff
-- because it carries rates (20260814120400, 20260826090000). Nothing here is
-- money, so this follows child_contacts: plain RLS, no security-definer write
-- path, and a tenant predicate on every policy.
--
-- Roles, matched to the existing enum rather than job titles. profiles.title
-- is display-only and is not consulted (20260802154801).
--   platform_admin              Owner            read + write
--   director                    Head Admin       read + write
--   staff and is_site_lead      Site Admin       read + write
--   staff                       Teacher          read only
--
-- Site-lead writes are tenant-wide, same as child_contacts, not limited to
-- staff_locations. A teacher covering another room still has to see the
-- allergy, and the person loading notes should not be blocked by which
-- campus they are assigned to.
--
-- Load existing free-text allergy notes after applying this file. One string
-- per child, keyed by child id. The SQL editor bypasses RLS; the foreign key
-- still requires the child to belong to that tenant.
--
--   insert into public.child_health (tenant_id, child_id, allergy_notes)
--   values
--     (
--       '00000000-0000-0000-0000-000000000001',
--       '<child uuid>',
--       'Peanuts — carries an EpiPen. Hives and swelling.'
--     );
--
-- A second load for a child who already has a row:
--
--   insert into public.child_health (tenant_id, child_id, allergy_notes)
--   values (
--     '00000000-0000-0000-0000-000000000001',
--     '<child uuid>',
--     'Peanuts — carries an EpiPen. Hives and swelling.'
--   )
--   on conflict (child_id) do update
--     set allergy_notes = excluded.allergy_notes,
--         updated_at = now();

-- children.id is already unique. This second key lets a health row prove it
-- is the same tenant as the child, so a bulk insert cannot attach one
-- centre's notes to another centre's child.
alter table public.children
  add constraint children_id_tenant_id_key unique (id, tenant_id);

create type public.allergy_severity as enum (
  'mild',
  'moderate',
  'severe',
  'life_threatening'
);

-- One row per child. No row means nothing has been recorded yet, which the
-- app must not render as "no allergies" when the read itself failed.
create table public.child_health (
  child_id uuid not null,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  has_asthma boolean not null default false,
  asthma_notes text,
  milk_alternative text,
  dietary_restrictions text,
  health_notes text,
  -- Free-text allergy notes, including the one-string-per-child import.
  allergy_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (child_id),
  constraint child_health_child_tenant_fkey
    foreign key (child_id, tenant_id)
    references public.children (id, tenant_id)
    on delete cascade
);

create index child_health_tenant_id_idx on public.child_health (tenant_id);

comment on table public.child_health is
  'One health profile per child: asthma, milk alternative, diet, health notes, and free-text allergy notes.';
comment on column public.child_health.allergy_notes is
  'Free-text allergy notes. One string per child, keyed by child_id.';
comment on column public.child_health.milk_alternative is
  'What to serve instead of cow''s milk, such as soy or oat. Null when unspecified.';
comment on column public.child_health.asthma_notes is
  'Asthma plan and where the inhaler is. Meaningful when has_asthma is true.';

-- Many allergens per child. action_plan is the medication or what to do
-- (EpiPen, inhaler, antihistamine), kept as text so a centre is not limited
-- to a fixed list.
create table public.child_allergies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  child_id uuid not null,
  allergen text not null,
  severity public.allergy_severity not null default 'moderate',
  reaction text,
  action_plan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_allergies_allergen_not_blank check (length(btrim(allergen)) > 0),
  constraint child_allergies_child_tenant_fkey
    foreign key (child_id, tenant_id)
    references public.children (id, tenant_id)
    on delete cascade
);

create index child_allergies_tenant_child_idx
  on public.child_allergies (tenant_id, child_id);

comment on column public.child_allergies.action_plan is
  'What to do and which medication to use, such as EpiPen or inhaler.';

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.child_health enable row level security;
alter table public.child_allergies enable row level security;

create policy "child_health_select" on public.child_health
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin', 'staff')
  );

create policy "child_health_write" on public.child_health
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or public.current_is_site_lead()
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or public.current_is_site_lead()
    )
  );

create policy "child_allergies_select" on public.child_allergies
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('director', 'platform_admin', 'staff')
  );

create policy "child_allergies_write" on public.child_allergies
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or public.current_is_site_lead()
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or public.current_is_site_lead()
    )
  );

create trigger set_child_health_updated_at
  before update on public.child_health
  for each row execute function public.set_updated_at();

create trigger set_child_allergies_updated_at
  before update on public.child_allergies
  for each row execute function public.set_updated_at();
