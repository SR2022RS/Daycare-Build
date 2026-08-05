-- Descriptive staff title (e.g. "Alpha Staff", "Site Admin", "Teacher") --
-- display-only, does not drive access control. Actual permissions still
-- come from profiles.role (director/staff/platform_admin). Keeping these
-- separate avoids widening the RLS-bearing role enum for what is, per the
-- client's own vocabulary, a job-title distinction rather than a
-- permission tier.
alter table public.profiles add column title text;
