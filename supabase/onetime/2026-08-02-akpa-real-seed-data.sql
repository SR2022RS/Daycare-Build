-- One-off production data load for AKPA University, sourced from the
-- client's 21-page packet + discovery call (see AKPA-Portal-Seed-Data.md).
-- NOT a repeatable migration -- this is real business data for one tenant,
-- not an environment-agnostic fixture. Run once via psql against the live
-- project. Idempotent via NOT EXISTS guards (none of these tables have a
-- unique constraint beyond id, so ON CONFLICT can't be used here).
--
-- Explicitly NOT included (need new schema, not just seed data -- follow-up
-- work, not done in this pass):
--   - Org calendar / holiday closures (no calendar table exists yet)
--   - CARI/CHRI/Mantoux/medical-exam credential tracking with renewal dates
--     and the "no unsupervised access before orientation + background
--     clearance" compliance gate (needs a staff_credentials table, not a
--     training_modules row)
--
-- Policy file_url is NOT NULL but no real files/URLs exist yet (client
-- still needs to supply them) -- uses '#' as an explicit placeholder.

-- ── Locations ────────────────────────────────────────────────────────────
insert into public.locations (tenant_id, name, address, is_active)
select v.tenant_id, v.name, v.address, v.is_active
from (
  values
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Main Campus', '779 East 26th St, Paterson NJ 07504', true),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Campus 2', '750 Broadway, Paterson NJ 07514', true),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Campus 3', '39 East 39th St, Paterson NJ 07504', true),
    -- Pending DOH approval -- seeded dormant, toggle is_active when cleared.
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Irvington', '107 Welland Ave, Irvington NJ 07111', false),
    -- Seasonal, operates from existing campuses -- no fixed address yet.
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Summer Camp', null, true)
) as v(tenant_id, name, address, is_active)
where not exists (
  select 1 from public.locations l where l.tenant_id = v.tenant_id and l.name = v.name
);

-- ── Policies Library (titles/categories only -- files pending from client) ──
insert into public.policies (tenant_id, title, category, file_url)
select v.tenant_id, v.title, v.category, '#'
from (
  values
    -- Parent Policies
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Information to Parents', 'Parent Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Policy on the Release of Children', 'Parent Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Positive Guidance and Discipline Policy', 'Parent Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Expulsion Policy', 'Parent Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Policy on the Use of Technology and Social Media', 'Parent Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Communicable Disease Policy', 'Parent Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Policy on Methods of Parental Notification', 'Parent Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Parent Handbook', 'Parent Policies'),
    -- Payment Policies
    ('00000000-0000-0000-0000-000000000001'::uuid, 'On Time Payments', 'Payment Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Irreversible Payments', 'Payment Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Private Payments', 'Payment Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Annual Application Renewal', 'Payment Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Contract & Rate Agreement', 'Payment Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Late Pickup Fee Schedule', 'Payment Policies'),
    -- Staff Policies
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Staff Receipt of Information', 'Staff Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Criminal Disclosure Statement (staff)', 'Staff Policies'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Staff Handbook', 'Staff Policies'),
    -- State Compliance
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Child Records Checklist', 'State Compliance'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Staff Records Checklist', 'State Compliance'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Record Retention', 'State Compliance')
) as v(tenant_id, title, category)
where not exists (
  select 1 from public.policies p where p.tenant_id = v.tenant_id and p.title = v.title
);

-- ── Training modules: compliance + policy sign-offs ─────────────────────
insert into public.training_modules (tenant_id, title, category, required, sort_order)
select v.tenant_id, v.title, v.category, true, v.sort_order
from (
  values
    ('00000000-0000-0000-0000-000000000001'::uuid, 'New Hire Orientation Training', 'Compliance', 1),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Annual Orientation Refresher', 'Compliance', 2),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Understanding Licensing', 'Compliance', 3),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Information to Parents Sign-off', 'Policy Sign-offs', 1),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Release of Children Sign-off', 'Policy Sign-offs', 2),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Positive Guidance and Discipline Sign-off', 'Policy Sign-offs', 3),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Technology and Social Media Sign-off', 'Policy Sign-offs', 4),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Parental Notification Methods Sign-off', 'Policy Sign-offs', 5),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Criminal Disclosure Statement Sign-off', 'Policy Sign-offs', 6)
) as v(tenant_id, title, category, sort_order)
where not exists (
  select 1 from public.training_modules m where m.tenant_id = v.tenant_id and m.title = v.title
);
