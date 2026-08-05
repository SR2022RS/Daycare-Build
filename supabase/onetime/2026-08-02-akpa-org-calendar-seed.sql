-- Closure days from AKPA-Portal-Seed-Data.md Sec.3, seeded as the next
-- concrete occurrence of each from today (2026-08-02). Fixed-date and
-- rule-based holidays (Labor Day, Thanksgiving, MLK, Memorial Day, Good
-- Friday) computed via date math, not guessed -- see chat for the script.
-- Good Friday depends on Easter (Anonymous Gregorian algorithm); flagged in
-- notes since it's computed rather than client-confirmed.
--
-- NOT seeded: "Spring Break (week)" -- the source doc gives no month, week,
-- or any date anchor for it at all, so a specific date would be invented,
-- not derived. Add it once the client confirms timing.
--
-- These are one-time rows for the 2026-2027 cycle, not a recurring rule --
-- re-seed next year's occurrences when this cycle passes.

insert into public.org_calendar (tenant_id, name, start_date, end_date, notes)
select v.tenant_id, v.name, v.start_date::date, v.end_date::date, v.notes
from (
  values
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Classroom Restructuring (last 3 days of August)', '2026-08-29', '2026-08-31', null),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Labor Day', '2026-09-07', '2026-09-07', null),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Thanksgiving Day', '2026-11-26', '2026-11-26', null),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Christmas Week', '2026-12-21', '2026-12-25', 'Client said "Christmas Day (week per call)" -- confirm exact range'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'New Year''s Day', '2027-01-01', '2027-01-01', null),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Martin Luther King Jr. Day', '2027-01-18', '2027-01-18', null),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Good Friday', '2027-03-26', '2027-03-26', 'Computed from Easter 2027 (Mar 28) -- not explicitly client-confirmed'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Memorial Day', '2027-05-31', '2027-05-31', null),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Juneteenth', '2027-06-19', '2027-06-19', 'Falls on a Saturday in 2027 -- confirm if observed on an adjacent weekday'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Independence Day', '2027-07-04', '2027-07-04', 'Falls on a Sunday in 2027 -- confirm if observed on an adjacent weekday')
) as v(tenant_id, name, start_date, end_date, notes)
where not exists (
  select 1 from public.org_calendar c where c.tenant_id = v.tenant_id and c.name = v.name
);
