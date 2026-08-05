-- Client uploaded the real AKPA logo and iterated on brand colors in the
-- design tool -- switching from the placeholder gold/burgundy "university
-- crest" concept to the actual logo's palette (pink/cyan). Updates the
-- live tenant row to match; logo_url points at the Next.js public/ asset
-- (see public/logo/akpa-logo.png).

update public.tenants
set
  primary_color = '#E30C7B',
  accent_color = '#3CC0D8',
  logo_url = '/logo/akpa-logo.png'
where id = '00000000-0000-0000-0000-000000000001';
