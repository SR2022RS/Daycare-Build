-- Seed data for local dev / initial setup.
-- `supabase db reset` runs this automatically against the local dev database.
-- To seed the real (remote) project, run this file's contents via the Supabase
-- SQL Editor or `supabase db push` followed by a manual insert, after linking.

-- AKPA's own tenant instance -- brand values from the real logo
-- (public/logo/akpa-logo.png), uploaded by the client.
insert into public.tenants (id, name, logo_url, primary_color, accent_color, powered_by_akpa)
values (
  '00000000-0000-0000-0000-000000000001',
  'AKPA University',
  '/logo/akpa-logo.png',
  '#E30C7B', -- AKPA pink
  '#3CC0D8', -- AKPA cyan
  true
)
on conflict (id) do nothing;

-- A starter set of required training modules, grouped by category, so the
-- Staff Training screen has real content to render against on first run.
-- training_modules has no unique constraint, so idempotency is enforced here
-- via NOT EXISTS rather than ON CONFLICT (which would be a silent no-op).
insert into public.training_modules (tenant_id, title, category, required, sort_order)
select v.tenant_id, v.title, v.category, v.required, v.sort_order
from (
  values
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Welcome to AKPA', 'Onboarding', true, 1),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Staff Handbook Overview', 'Onboarding', true, 2),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Infant Safety Basics', 'Infant Safety', true, 1),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Safe Sleep Practices', 'Infant Safety', true, 2),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Toddler Development Milestones', 'Toddler Development', true, 1),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Positive Behavior Guidance', 'Toddler Development', true, 2),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Emergency Evacuation Procedures', 'Emergency Preparedness', true, 1),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'First Aid & CPR Refresher', 'Emergency Preparedness', true, 2)
) as v(tenant_id, title, category, required, sort_order)
where not exists (
  select 1 from public.training_modules m
  where m.tenant_id = v.tenant_id and m.title = v.title
);
