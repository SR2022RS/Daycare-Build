-- Staff Training: modules, quizzes, and per-staff progress/certification

create table public.training_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  category text not null, -- e.g. 'Onboarding', 'Infant Safety', 'Toddler Development', 'Emergency Preparedness'
  content_url text,
  required boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index training_modules_tenant_id_idx on public.training_modules (tenant_id);

create table public.training_quizzes (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules (id) on delete cascade,
  questions jsonb not null default '[]'::jsonb,
  passing_score int not null default 80
);

create table public.staff_training_progress (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles (id) on delete cascade,
  module_id uuid not null references public.training_modules (id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz,
  quiz_score int,
  certificate_url text,
  updated_at timestamptz not null default now(),
  unique (staff_id, module_id)
);

create index staff_training_progress_staff_id_idx on public.staff_training_progress (staff_id);

create trigger set_staff_training_progress_updated_at
  before update on public.staff_training_progress
  for each row execute function public.set_updated_at();
