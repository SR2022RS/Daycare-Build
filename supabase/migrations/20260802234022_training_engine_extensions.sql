-- Staff Portal §3: training engine extensions.
-- - Content blocks per module (video/text/file, ordered) for T9's module player.
-- - Quiz attempts log for T10 (unlimited retakes, attempts logged).
-- - Module -> credential linkage + renewal cycle, and the auto-wire trigger:
--   completing a linked module writes the clearance straight onto the
--   staff's credential record (no double entry), per the spec's "clever wire."
-- Certificates (T11) need no new table -- staff_training_progress.id is
-- already a stable id and doubles as the certificate id.

alter table public.training_modules
  add column credential_type public.credential_type,
  add column renewal_months int;

create type public.content_block_type as enum ('video', 'text', 'file');

create table public.training_content_blocks (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules (id) on delete cascade,
  block_type public.content_block_type not null,
  sort_order int not null default 0,
  video_url text,
  text_content text,
  file_url text,
  created_at timestamptz not null default now()
);

create index training_content_blocks_module_id_idx on public.training_content_blocks (module_id);

alter table public.training_content_blocks enable row level security;

create policy "training_content_blocks_select" on public.training_content_blocks
  for select to authenticated
  using (
    exists (
      select 1 from public.training_modules m
      where m.id = training_content_blocks.module_id and m.tenant_id = public.current_tenant_id()
    )
  );

create policy "training_content_blocks_write" on public.training_content_blocks
  for all to authenticated
  using (
    exists (
      select 1 from public.training_modules m
      where m.id = training_content_blocks.module_id
        and m.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.training_modules m
      where m.id = training_content_blocks.module_id
        and m.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles (id) on delete cascade,
  module_id uuid not null references public.training_modules (id) on delete cascade,
  score int not null,
  passed boolean not null,
  attempted_at timestamptz not null default now()
);

create index quiz_attempts_staff_id_idx on public.quiz_attempts (staff_id);
create index quiz_attempts_module_id_idx on public.quiz_attempts (module_id);

alter table public.quiz_attempts enable row level security;

create policy "quiz_attempts_select" on public.quiz_attempts
  for select to authenticated
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from public.training_modules m
      where m.id = quiz_attempts.module_id
        and m.tenant_id = public.current_tenant_id()
        and public.current_role() in ('director', 'platform_admin')
    )
  );

-- Attempts are an immutable log -- staff insert their own, nobody updates/deletes.
create policy "quiz_attempts_insert" on public.quiz_attempts
  for insert to authenticated
  with check (staff_id = auth.uid());

-- security definer: writes to staff_credentials, which staff cannot normally
-- self-certify (staff_credentials_write is director/platform_admin only).
-- That restriction is about self-certification; this is a system-triggered
-- side effect of a real completion event, not a user asserting their own
-- clearance, so bypassing RLS here is intentional and narrowly scoped.
create function public.sync_training_completion_to_credential()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credential_type public.credential_type;
  v_tenant_id uuid;
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    select credential_type, tenant_id into v_credential_type, v_tenant_id
    from public.training_modules
    where id = new.module_id;

    if v_credential_type is not null then
      insert into public.staff_credentials (tenant_id, staff_id, credential_type, date_cleared)
      values (v_tenant_id, new.staff_id, v_credential_type, coalesce(new.completed_at, now())::date)
      on conflict (staff_id, credential_type)
      do update set date_cleared = excluded.date_cleared;
    end if;
  end if;
  return new;
end;
$$;

create trigger sync_training_completion_to_credential_trigger
  after insert or update on public.staff_training_progress
  for each row execute function public.sync_training_completion_to_credential();
