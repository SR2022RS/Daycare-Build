-- Money Module Steps 3-5: charges, invoices, payments.
-- Extends children/guardians per the Step 2 note ("do not fork").
-- Director/platform_admin only; staff get a restricted view in a later
-- migration (see child_balance_status).

create type public.charge_type as enum ('tuition', 'fee', 'credit', 'adjustment');
create type public.invoice_status as enum ('open', 'partial', 'paid', 'void');
-- 'stripe' is reserved for the future online-collection phase; adding it
-- now avoids an enum migration when that lands.
create type public.payment_method as enum ('cash', 'check', 'zelle', 'venmo', 'other', 'stripe');

-- Portion of weekly_rate covered by subsidy. Null for private-pay children;
-- parent copay is always weekly_rate - coalesce(subsidy_weekly_amount, 0).
alter table public.children
  add column subsidy_weekly_amount numeric(10, 2);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status public.invoice_status not null default 'open',
  total_amount numeric(10, 2) not null default 0,
  amount_paid numeric(10, 2) not null default 0,
  due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_tenant_id_idx on public.invoices (tenant_id);
create index invoices_guardian_id_idx on public.invoices (guardian_id);
create index invoices_status_idx on public.invoices (status);

-- One open invoice per guardian per period -- the grouping key the charge
-- generator looks up before deciding to create a new invoice.
create unique index invoices_guardian_period_key
  on public.invoices (guardian_id, period_start, period_end)
  where status <> 'void';

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  type public.charge_type not null,
  period_start date,
  period_end date,
  description text not null,
  subsidy_amount numeric(10, 2) not null default 0,
  parent_amount numeric(10, 2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  void boolean not null default false,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create index charges_tenant_id_idx on public.charges (tenant_id);
create index charges_child_id_idx on public.charges (child_id);
create index charges_invoice_id_idx on public.charges (invoice_id);

-- Idempotency: a child can only have one live tuition charge per period,
-- so re-running the generator (cron or the manual button) is a no-op.
create unique index charges_tuition_period_key
  on public.charges (child_id, period_start)
  where type = 'tuition' and void = false;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  method public.payment_method not null,
  paid_at date not null,
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);

create index payments_tenant_id_idx on public.payments (tenant_id);
create index payments_invoice_id_idx on public.payments (invoice_id);

create trigger set_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.invoices enable row level security;

create policy "invoices_select" on public.invoices
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "invoices_write" on public.invoices
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

alter table public.charges enable row level security;

create policy "charges_select" on public.charges
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "charges_write" on public.charges
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

alter table public.payments enable row level security;

create policy "payments_select" on public.payments
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));

create policy "payments_write" on public.payments
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'))
  with check (tenant_id = public.current_tenant_id() and public.current_role() in ('director', 'platform_admin'));
