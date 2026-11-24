-- Accident / injury reports.
--
-- Separate from incident_reports. That table is the short kiosk note
-- (what happened, action taken, sign-off). This one is the paper accident
-- form: per child, per campus, with injury, first aid, witnesses, parent
-- notification, a recorded parent signature, and an admin close.
--
-- The Office of Licensing deadline is not stored. N.J.A.C. 3A:52-7.10(b)
-- requires a verbal report by the next working day, and documentation within
-- one week, when an injury under the center's supervision results in an
-- emergency-room visit, a hospital admission, death, a 911 call, on-site or
-- transported emergency care, or urgent care. The app computes those two
-- dates from occurred_on when ool_reportable is true. This table does not
-- send anything.
--
-- Depends on children_id_tenant_id_key from 20261124002625_child_health.sql.
--
-- Roles, same split as child health (titles are display-only):
--   platform_admin / director     read all in the tenant, edit, close
--   staff and is_site_lead        read and edit reports at their campuses
--   staff                         create, and read only the reports they filed
-- Teachers cannot update a report after filing. Admins edit and close.

create type public.accident_status as enum ('open', 'reviewed', 'closed');

create type public.parent_notify_method as enum ('phone', 'in_person', 'message');

create table public.accident_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete restrict,
  child_id uuid not null,
  filed_by uuid not null references public.profiles (id),

  occurred_on date not null,
  -- Wall-clock time at the campus, not a timestamptz. A stored UTC instant
  -- would display a few hours off on a server that is not in New Jersey.
  occurred_time time not null,
  place text not null,

  what_happened text not null,
  injury_type text not null,
  body_part text not null,
  first_aid text not null,

  staff_present text not null,
  witnesses text,

  parent_notified boolean not null default false,
  parent_notified_on date,
  parent_notified_time time,
  parent_notify_method public.parent_notify_method,
  parent_notified_by text,

  ool_reportable boolean not null default false,

  -- Record of a signature already given. Nothing is sent to the parent.
  parent_signature_name text,
  parent_signed_on date,

  status public.accident_status not null default 'open',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accident_reports_place_not_blank check (length(btrim(place)) > 0),
  constraint accident_reports_what_not_blank check (length(btrim(what_happened)) > 0),
  constraint accident_reports_injury_not_blank check (length(btrim(injury_type)) > 0),
  constraint accident_reports_body_not_blank check (length(btrim(body_part)) > 0),
  constraint accident_reports_first_aid_not_blank check (length(btrim(first_aid)) > 0),
  constraint accident_reports_staff_not_blank check (length(btrim(staff_present)) > 0),
  constraint accident_reports_notify_complete check (
    parent_notified = false
    or (
      parent_notified_on is not null
      and parent_notified_time is not null
      and parent_notify_method is not null
      and parent_notified_by is not null
      and length(btrim(parent_notified_by)) > 0
    )
  ),
  constraint accident_reports_signature_pair check (
    (parent_signature_name is null and parent_signed_on is null)
    or (
      parent_signature_name is not null
      and length(btrim(parent_signature_name)) > 0
      and parent_signed_on is not null
    )
  ),
  constraint accident_reports_child_tenant_fkey
    foreign key (child_id, tenant_id)
    references public.children (id, tenant_id)
    on delete cascade
);

create index accident_reports_tenant_id_idx on public.accident_reports (tenant_id);
create index accident_reports_location_id_idx on public.accident_reports (location_id);
create index accident_reports_child_id_idx on public.accident_reports (child_id);
create index accident_reports_filed_by_idx on public.accident_reports (filed_by);

comment on table public.accident_reports is
  'Per-child accident/injury report. Parent signature is a record only. No notification is sent.';
comment on column public.accident_reports.ool_reportable is
  'Staff judgment that N.J.A.C. 3A:52-7.10(b) applies. The screen shows the deadline; it does not file the report.';

alter table public.accident_reports enable row level security;

create policy "accident_reports_select" on public.accident_reports
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      filed_by = auth.uid()
      or public.current_role() in ('director', 'platform_admin')
      or (
        public.current_is_site_lead()
        and exists (
          select 1 from public.staff_locations sl
          where sl.staff_id = auth.uid()
            and sl.location_id = accident_reports.location_id
        )
      )
    )
  );

-- Filing only. status is forced to open so a teacher cannot close a report
-- by inserting it already closed.
create policy "accident_reports_insert" on public.accident_reports
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and filed_by = auth.uid()
    and status = 'open'
    and reviewed_by is null
    and closed_by is null
    and public.current_role() in ('director', 'platform_admin', 'staff')
    and public.has_location_access(location_id)
  );

create policy "accident_reports_update" on public.accident_reports
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or (
        public.current_is_site_lead()
        and exists (
          select 1 from public.staff_locations sl
          where sl.staff_id = auth.uid()
            and sl.location_id = accident_reports.location_id
        )
      )
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('director', 'platform_admin')
      or (
        public.current_is_site_lead()
        and exists (
          select 1 from public.staff_locations sl
          where sl.staff_id = auth.uid()
            and sl.location_id = accident_reports.location_id
        )
      )
    )
  );

create trigger set_accident_reports_updated_at
  before update on public.accident_reports
  for each row execute function public.set_updated_at();
