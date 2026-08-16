-- Support / Help Center module: staff file tickets, director/platform_admin
-- manage the tenant queue. Same access shape as incident_reports (staff
-- creates + sees own, director sees/manages all in tenant) -- see that
-- migration for the pattern this mirrors.

create type public.support_ticket_category as enum ('question', 'bug', 'feature_request', 'account_access', 'other');
create type public.support_ticket_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.support_ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  category public.support_ticket_category not null default 'question',
  priority public.support_ticket_priority not null default 'medium',
  status public.support_ticket_status not null default 'open',
  subject text not null,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index support_tickets_tenant_id_idx on public.support_tickets (tenant_id);
create index support_tickets_created_by_idx on public.support_tickets (created_by);

create trigger set_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- The ticket's own `description` is the first message, shown inline on the
-- ticket -- this table is only the reply thread after that.
create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index support_ticket_messages_ticket_id_idx on public.support_ticket_messages (ticket_id, created_at);

-- file_path is a Storage object key (bucket is private), not a public URL --
-- readers resolve a short-lived signed URL server-side at render time.
create table public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index support_ticket_attachments_ticket_id_idx on public.support_ticket_attachments (ticket_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;

create policy "support_tickets_select" on public.support_tickets
  for select to authenticated
  using (
    created_by = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  );

create policy "support_tickets_insert" on public.support_tickets
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and created_by = auth.uid());

-- Only director/platform_admin change status -- the creator cannot
-- self-resolve/close their own ticket, same "no self-certification"
-- reasoning as incident_reports/write_ups.
create policy "support_tickets_update" on public.support_tickets
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "support_ticket_messages_select" on public.support_ticket_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          t.created_by = auth.uid()
          or (t.tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
        )
    )
  );

-- Both the ticket's creator and director/platform_admin can reply.
create policy "support_ticket_messages_insert" on public.support_ticket_messages
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and t.tenant_id = public.current_tenant_id()
        and (
          t.created_by = auth.uid()
          or public.current_role() in ('director', 'platform_admin')
        )
    )
  );

create policy "support_ticket_attachments_select" on public.support_ticket_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_attachments.ticket_id
        and (
          t.created_by = auth.uid()
          or (t.tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
        )
    )
  );

create policy "support_ticket_attachments_insert" on public.support_ticket_attachments
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and uploaded_by = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_attachments.ticket_id
        and t.tenant_id = public.current_tenant_id()
        and (
          t.created_by = auth.uid()
          or public.current_role() in ('director', 'platform_admin')
        )
    )
  );

-- ── Storage: private bucket, path convention {tenant_id}/{ticket_id}/{file} ─
insert into storage.buckets (id, name, public) values ('ticket-attachments', 'ticket-attachments', false);

create policy "ticket_attachments_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from public.support_tickets t
      where t.id = ((storage.foldername(name))[2])::uuid
        and t.tenant_id = ((storage.foldername(name))[1])::uuid
        and (
          t.created_by = auth.uid()
          or (t.tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
        )
    )
  );

create policy "ticket_attachments_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from public.support_tickets t
      where t.id = ((storage.foldername(name))[2])::uuid
        and t.tenant_id = ((storage.foldername(name))[1])::uuid
        and (
          t.created_by = auth.uid()
          or (t.tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
        )
    )
  );
