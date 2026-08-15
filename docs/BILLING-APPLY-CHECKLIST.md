# Billing Engine — Post-Apply Checklist

These migrations were authored but never applied or run against any
database (per controller ruling: the project isn't linked and the database
is live production). Run this checklist yourself, in timestamp order, after
applying all of them -- none are re-runnable, so apply in exactly this
order and do not skip any:

- `supabase/migrations/20260814120000_billing_engine.sql`
- `supabase/migrations/20260814120100_billing_generation.sql`
- `supabase/migrations/20260814120200_billing_balance_view.sql`
- `supabase/migrations/20260814120300_billing_recalc_triggers.sql`
- `supabase/migrations/20260814120400_child_roster_view.sql`
- `supabase/migrations/20260814120500_roster_location_scope.sql`
- `supabase/migrations/20260814120600_overpayment_credits.sql`
- `supabase/migrations/20260814120700_attach_pending_credits.sql`
- `supabase/migrations/20260814120800_guard_paid_invoice_credit_attach.sql`

## 0. pg_cron may need enabling first

`20260814120100_billing_generation.sql` runs `create extension if not exists
pg_cron;` — with NO `with schema` clause. pg_cron is non-relocatable: it always
installs into a schema named `cron`, and an earlier draft of this migration said
`with schema extensions`, which made `CREATE EXTENSION` itself fail and aborted
everything after it. **Do not "correct" it back to that form.**

On Supabase, `pg_cron` is listed under **Database → Extensions** in the dashboard
and may need enabling there first — if the extension isn't allow-listed for the
project, this statement fails and aborts the rest of the migration. Enable it in
the dashboard, then re-run. If it is already enabled, `if not exists` makes the
line a harmless no-op.

## 1. Idempotency check

Generation must be a no-op the second time it runs for the same date. Replace
`<TENANT_ID>` with a real tenant id that has active children with a
`weekly_rate`, a `weekly`/`biweekly`/`monthly` cadence period starting on the
date used, and a payer guardian.

```sql
select public.generate_recurring_charges('<TENANT_ID>'::uuid, '2026-08-17'::date);
select public.generate_recurring_charges('<TENANT_ID>'::uuid, '2026-08-17'::date);
```

Expected: the first call returns the number of charges created (> 0 if
eligible children exist). **The second call must return `0`** — the
`charges_tuition_period_key` partial unique index makes the re-run a no-op.

## 2. Invoice-grouping check

One invoice per payer guardian for the period, with `total_amount` equal to
the sum of that family's children's parent copays.

```sql
select i.id, g.full_name, i.period_start, i.period_end, i.total_amount, i.status,
       count(ch.id) as charge_count,
       sum(ch.parent_amount) as sum_parent_amount
from public.invoices i
join public.guardians g on g.id = i.guardian_id
left join public.charges ch on ch.invoice_id = i.id and ch.void = false
group by i.id, g.full_name, i.period_start, i.period_end, i.total_amount, i.status;
```

Expected: one row per payer guardian who has an eligible child; `charge_count`
matches their number of enrolled/eligible children billed for that period;
`total_amount` equals `sum_parent_amount` (both are the sum of that family's
children's parent copays for the period).

## 3. Boundary checks — SQL must agree with src/lib/billing/periods.test.ts

These are the exact periods asserted by the TypeScript tests in
`src/lib/billing/periods.test.ts`. Run `generate_recurring_charges` (or just
inspect the resulting `invoices` rows) for a tenant/child set covering each
cadence, and confirm the periods produced match exactly:

| Cadence   | `p_on`       | Expected `period_start` | Expected `period_end` |
|-----------|--------------|--------------------------|-------------------------|
| weekly    | 2026-08-17   | 2026-08-17                | 2026-08-23              |
| monthly   | 2026-08-01   | 2026-08-01                | 2026-08-31              |
| biweekly  | 2026-08-03   | 2026-08-03                | 2026-08-16              |
| biweekly  | 2026-08-17   | 2026-08-17                | 2026-09-06              |

You can sanity-check the underlying date math directly without any child
data, e.g.:

```sql
select
  (date_trunc('month', d)::date
    + ((8 - extract(dow from date_trunc('month', d))::integer) % 7)) as first_monday,
  (date_trunc('month', d)::date
    + ((8 - extract(dow from date_trunc('month', d))::integer) % 7)) + 14 as third_monday
from (values ('2026-08-01'::date)) as t(d);
```

Expected: `first_monday = 2026-08-03`, `third_monday = 2026-08-17` — matching
`firstMondayOf`/`thirdMondayOf` in `periods.test.ts`.

Then confirm actual generated invoices land on these boundaries:

```sql
select period_start, period_end
from public.invoices
where period_start in ('2026-08-17', '2026-08-01', '2026-08-03')
order by period_start;
```

## 4. Cron registration check

```sql
select jobname, schedule, active from cron.job where jobname = 'daily-billing';
```

Expected: exactly one row, `schedule = '0 6 * * *'`, `active = t`.

## 5. Staff isolation (Task 4 view)

Confirm staff can read `child_balance_status` but not the underlying money
tables. From a staff-role session (or by temporarily instrumenting a
staff-reachable Server Component and removing the probe afterward):

```ts
const probe = await supabase.from("charges").select("id").limit(1);
const probeView = await supabase.from("child_balance_status").select("child_id").limit(1);
console.log("charges rows:", probe.data?.length ?? 0, "view rows:", probeView.data?.length ?? 0);
```

Expected: `charges rows: 0` (RLS blocks staff), `view rows: 1` or more.

Also check the view directly as director/platform_admin:

```sql
select child_balance_status.*, ch.full_name
from public.child_balance_status
join public.children ch on ch.id = child_balance_status.child_id
limit 20;
```

Expected: one row per child, `balance_status` either `current` or `overdue`,
no dollar amounts exposed.

## 5a. Cross-tenant isolation on `child_balance_status` (fix round 1, Critical 1)

`child_balance_status` runs with `security_invoker = false` (owner rights),
so views cannot carry their own RLS -- the tenant scoping now comes from an
explicit `where c.tenant_id = public.current_tenant_id()` filter in the view
body. This must be proven, not assumed: as a staff user belonging to
**tenant A**, with at least one other tenant ("tenant B") holding children
in the database, run:

```sql
select distinct tenant_id from public.child_balance_status;
```

Expected: **exactly one** `tenant_id` in the result, and it must equal
tenant A's id -- never a row from any other tenant. If more than one
`tenant_id` appears, or a tenant B id appears while signed in as tenant A,
the tenant filter regressed and this is a cross-tenant data leak (staff and
any other authenticated role would be able to read every tenant's child
delinquency status). Repeat signed in as a tenant B user and confirm the
single `tenant_id` returned flips to tenant B's id.

## 6. Zero-rate subsidy guard (controller ruling 2)

If any child has `weekly_rate = 0` and a non-null `subsidy_weekly_amount`
with `funding_type <> 'private'`, confirm the generator does not raise
`division_by_zero` and that the resulting charge has `subsidy_amount = 0`
(not null):

```sql
select id, subsidy_amount, parent_amount
from public.charges
where child_id = '<CHILD_ID_WITH_ZERO_RATE>'
order by created_at desc
limit 1;
```

Expected: no error during generation; `subsidy_amount = 0.00`.

## 7. Fix-round-1 checks

**Critical 2 — tenant/role guard on `generate_recurring_charges`.** Signed
in as a non-director/non-platform_admin authenticated user (or as a
director of a *different* tenant), attempt:

```sql
select public.generate_recurring_charges('<SOME_OTHER_TENANT_ID>'::uuid, '2026-08-17'::date);
```

Expected: raises an exception ("not authorized to generate charges for
tenant ..."), no charges/invoices created. As a director/platform_admin
calling with their own tenant id, the call should still succeed as before.

**Critical 3 — `run_daily_billing` / `recalc_invoice_totals` /
`generate_recurring_charges_impl` reachable by no REST role at all.**
`revoke ... from public` alone does not remove Supabase's default
schema privileges, which grant EXECUTE directly to `anon`/`authenticated`/
`service_role` at function-creation time independent of the `PUBLIC`
pseudo-role -- fix round 1 revoked only `PUBLIC` on these four functions,
leaving `anon`/`authenticated`/`service_role` grants untouched and the
functions still callable via `POST /rest/v1/rpc/<name>`. Fix round 2
revoked those explicitly; verify with:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'run_daily_billing', 'recalc_invoice_totals',
    'generate_recurring_charges_impl', 'generate_recurring_charges'
  )
order by routine_name, grantee;
```

Expected:
- `run_daily_billing`, `recalc_invoice_totals`, and
  `generate_recurring_charges_impl` — **zero rows** with `grantee` in
  (`anon`, `authenticated`, `service_role`, `PUBLIC`). Any row naming one of
  these three functions with any of those grantees means the hole is still
  open and the function is still reachable via PostgREST RPC.
- `generate_recurring_charges` — **exactly one** row: `grantee =
  authenticated`, `privilege_type = EXECUTE`. No row for `anon`,
  `service_role`, or `PUBLIC`.

Also directly attempt the RPC call as an authenticated non-director (or as
a director of a different tenant) to confirm it's actually blocked, not
just absent from this view:

```
POST /rest/v1/rpc/generate_recurring_charges_impl
{"p_tenant_id": "<any tenant id>", "p_on": "2026-08-17"}
```

Expected: `404`/`42883`-style "function not found in schema cache" or a
permission-denied error -- never a successful billing run.

**Important 4 — negative `parent_amount` clamp.** Set up a child with
`funding_type <> 'private'` and `subsidy_weekly_amount` deliberately greater
than `weekly_rate` (a data-entry error), then generate a charge for them:

```sql
select subsidy_amount, parent_amount
from public.charges
where child_id = '<CHILD_ID_WITH_OVER_SUBSIDY>'
order by created_at desc
limit 1;
```

Expected: `parent_amount >= 0` (never negative), and
`subsidy_amount + parent_amount` equals the period's full rate (the subsidy
was clamped down to the period amount, not left overshooting it).

**Important 5 — no orphan invoice after void + re-run.** Void an invoice
that has a live tuition charge on it (`update public.invoices set status =
'void' where id = '<INVOICE_ID>'`), then re-run generation for the same
`p_on` date used to create the original charge, then check:

```sql
select id, status, total_amount
from public.invoices
where guardian_id = '<GUARDIAN_ID>' and period_start = '<PERIOD_START>' and status <> 'void';
```

Expected: **no row** (or, if a legitimate replacement invoice was expected
for other reasons, no `open`/$0 invoice with zero charges attached). Re-run
generation a second and third time and confirm no new empty invoices
accumulate.

**Important 6 — fully-credited invoice reads as `paid`.** Create an invoice
whose only charge is a negative-`parent_amount` credit (so
`sum(parent_amount) <= 0`) with no payments recorded, then:

```sql
select public.recalc_invoice_totals('<INVOICE_ID>'::uuid);
select status, total_amount, amount_paid from public.invoices where id = '<INVOICE_ID>'::uuid;
```

Expected: `status = 'paid'`, not `open`.

## 7a. Fix-round-1 (Task 10) — staff roster columns on `child_balance_status`

`supabase/migrations/20260814120400_child_roster_view.sql` extends
`child_balance_status` with `full_name`, `classroom`, and `location_name` so
the staff-facing `/children` roster and `/children/[childId]` card (which
cannot read `public.children` directly -- RLS restricts `children_select` to
director/platform_admin) have a legal, no-amounts source for those columns.
This must be proven from a **staff** session, not just read from the SQL:

```sql
-- As a STAFF user (their own JWT/session, not service_role):
select child_id, full_name, classroom, location_name, balance_status
from public.child_balance_status
limit 20;
```

Expected: rows come back (not an empty/error result) -- one row per child in
the staff user's own tenant, `full_name`/`classroom`/`location_name`
populated, `balance_status` either `current` or `overdue`. Then, same
session:

```sql
select * from public.children;
```

Expected: **zero rows** -- `children_select` still blocks staff from the
underlying table directly; only the roster view opened up, not the table
that carries `weekly_rate`/`subsidy_weekly_amount`/`funding_type`/
`rate_note`. If the staff session gets rows back from `public.children`
directly, `children_select` regressed and the no-amounts boundary is broken.

Also re-run the cross-tenant check from 5a against the new columns: as a
staff user in tenant A (with at least one child in tenant B present in the
database), confirm every `full_name`/`classroom`/`location_name` returned
belongs to a tenant A child -- never a tenant B child's name leaking through
the roster columns.

## 8. Fix-round-2 checks

**Negative `weekly_rate` no longer aborts the nightly run.** `children`
has no `weekly_rate >= 0` constraint (deliberately -- see round-1 report --
adding one could block this whole migration if any live row already
violates it), so set up a private-pay child (`funding_type = 'private'`)
with a negative `weekly_rate`, then generate a charge for them:

```sql
select subsidy_amount, parent_amount
from public.charges
where child_id = '<CHILD_ID_WITH_NEGATIVE_RATE>'
order by created_at desc
limit 1;
```

Expected: no error (specifically, no `check_violation` on
`charges_tuition_parent_amount_non_negative`); `parent_amount = 0.00`, not
negative. Then confirm the run doesn't abort for other tenants: run
`select public.run_daily_billing();` (as the owning/service role) with at
least one other tenant present that has an eligible child, and confirm that
other tenant's child also got a charge generated -- i.e. the negative-rate
child in tenant A didn't kill generation for tenant B.

**Negative `subsidy_weekly_amount` clamped to zero.** Set up a
non-private-pay child with a negative `subsidy_weekly_amount` (another
data-entry error with no check constraint), then generate a charge:

```sql
select subsidy_amount, parent_amount
from public.charges
where child_id = '<CHILD_ID_WITH_NEGATIVE_SUBSIDY>'
order by created_at desc
limit 1;
```

Expected: `subsidy_amount = 0.00` (never negative), and
`subsidy_amount + parent_amount` equals the period rate -- the sum
invariant holds instead of `parent_amount` overshooting the period total.

## 9. Billing recalc triggers (`20260814120300_billing_recalc_triggers.sql`)

Tasks 5-7 fix round 1, Critical 1 / Controller Ruling D:
`recalc_invoice_totals` is (correctly) revoked from every REST role, which
meant the app's `.rpc("recalc_invoice_totals", ...)` calls on payment/charge
writes were silently unauthorized -- money got recorded while
`total_amount`/`amount_paid`/`status` on the parent invoice never moved.
Those RPC calls are now deleted from `src/lib/billing/actions.ts` entirely;
invoice totals are maintained by `charges`/`payments` triggers instead, so
this must be verified to actually fire with **no application involvement**
-- test directly in SQL, not through the app.

**9a. Recording a payment updates the invoice automatically.**

```sql
-- Note total_amount/amount_paid/status before:
select id, total_amount, amount_paid, status from public.invoices where id = '<INVOICE_ID>';

insert into public.payments (tenant_id, invoice_id, amount, method, paid_at, recorded_by)
values ('<TENANT_ID>', '<INVOICE_ID>', 50.00, 'cash', current_date, '<PROFILE_ID>');

select id, total_amount, amount_paid, status from public.invoices where id = '<INVOICE_ID>';
```

Expected: `amount_paid` increases by exactly 50.00 and `status` re-derives
correctly (`partial` if still owing, `paid` if the payment settles it) --
with no call to `recalc_invoice_totals` or any application code involved,
just the raw `insert`.

**9b. Voiding a charge reduces the invoice total automatically.**

```sql
select id, total_amount from public.invoices where id = '<INVOICE_ID>';
select id, parent_amount, void from public.charges where id = '<CHARGE_ID>' and invoice_id = '<INVOICE_ID>';

update public.charges set void = true, voided_at = now() where id = '<CHARGE_ID>';

select id, total_amount, status from public.invoices where id = '<INVOICE_ID>';
```

Expected: `total_amount` drops by exactly the voided charge's
`parent_amount`, and `status` re-derives (e.g. flips to `paid` if the
remaining live charges are now fully covered by payments already on file).

**9c. Deleting a payment/charge and re-pointing invoice_id also recalculate.**
Deleting a row from `charges` or `payments` should recalc the invoice the
same way voiding does (the trigger fires on `delete` too, not just
`update`). If a charge's `invoice_id` is ever updated to point at a
different invoice, confirm **both** the old and new invoice's totals move --
the old one should drop by that charge's `parent_amount`, the new one
should rise by it.

**9d. Function still not directly callable.** Confirm `recalc_invoice_totals`
and the new `trg_recalc_invoice_totals` trigger function remain unreachable
via PostgREST for every REST role:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('recalc_invoice_totals', 'trg_recalc_invoice_totals')
order by routine_name, grantee;
```

Expected: zero rows with `grantee` in (`anon`, `authenticated`,
`service_role`, `PUBLIC`) for either function.

## 10. Final-review fix wave (2026-08-14)

**10a-pre. PRE-FLIGHT — confirm staff actually have location assignments.**
The location predicate added below is **fail-closed**: a staff member with no
row in `staff_locations` sees an EMPTY roster, not the whole tenant. If AKPA's
staff were never assigned to locations, applying `20260814120500` will make
every staff `/children` page render empty — which looks identical to a bug.
Run this BEFORE applying that migration:

```sql
select p.id, p.full_name, count(sl.location_id) as locations_assigned
from public.profiles p
left join public.staff_locations sl on sl.staff_id = p.id
where p.tenant_id = '<TENANT_ID>'::uuid and p.role = 'staff'
group by p.id, p.full_name
order by locations_assigned, p.full_name;
```

Expected: every staff row has `locations_assigned >= 1`. Any staff member at
`0` will see nothing on `/children` until they are assigned a location in
**Settings → Locations**. Assign them first, or accept that their roster is
empty by design until you do.

**10a. `child_balance_status` is location-scoped for staff, not just
tenant-scoped (Important 4).** `20260814120500_roster_location_scope.sql`
adds a `has_location_access(c.location_id)` predicate (directors/
platform_admins still see every location in their tenant, matching
`has_location_access`'s own director/platform_admin bypass). Prove this from
a **staff** session assigned to only one location, with at least one other
location in the same tenant holding children the staff user is *not*
assigned to:

```sql
-- As a staff user assigned to location A only, with children present at
-- both location A and location B in the same tenant:
select child_id, full_name, location_name
from public.child_balance_status;
```

Expected: every `location_name` returned is location A -- never location B.
Then confirm a director/platform_admin session in the same tenant still sees
children from *both* locations (the location predicate must not have
narrowed the director/admin view, which the spec still expects to see the
whole tenant). This is a regression check on top of the tenant-isolation
check in 5a/7a -- run those again too, since this migration restates the
tenant filter alongside the new location filter.

**10b. Full UI lifecycle as a director.** Load `/billing`, open an invoice,
record a partial payment through the `RecordPaymentForm`, confirm the status
badge flips to "Partially paid", pay the remainder, confirm it flips to
"Paid", then confirm `/billing/revenue` (billed/collected/outstanding tiles,
aging list) and the `/dashboard` "Outstanding balance" tile both move to
reflect the payments. This is the one path real money takes through the app
and nothing up to this point verifies it outside of raw SQL inserts.

**10c. Staff-session UI pass.** As a staff user (not director/platform_admin),
load `/children` and `/children/[childId]` and confirm they actually render
-- not merely that `child_balance_status` returns rows in SQL (10a/5a/7a
already cover that), but that the pages themselves load without error under
RLS, and that no dollar figure, rate, funding type, or guardian detail
appears anywhere on either page. Only name, classroom, location, and the
current/overdue balance badge should be visible.

**10d. Order of operations and rollback.** Migrations must be applied in the
timestamp order listed at the top of this document; none are re-runnable, so
re-running an already-applied file (or applying out of order) will fail or
produce incorrect state. If generation misbehaves after the cron job starts
firing on live data, stop it first with:

```sql
select cron.unschedule('daily-billing');
```

To re-enable later, re-run the `cron.schedule(...)` statement from
`20260814120100_billing_generation.sql`. There is no automated rollback for
the schema/function changes themselves -- correcting a bad generation run
means voiding the affected invoices/charges (never hard-deleting a financial
record, per the spec's error-handling section) and re-running generation for
the same `p_on` date once the underlying issue is fixed.

**10e. Dry run before live.** Before letting the 06:00 UTC cron touch real
families for the first time, run `generate_recurring_charges` (or
`run_daily_billing`) inside a transaction you roll back, so you can inspect
the invoices/charges it would create without committing them:

```sql
begin;
select public.generate_recurring_charges('<TENANT_ID>'::uuid, '<TODAY>'::date);
select i.id, g.full_name, i.total_amount, count(ch.id) as charge_count
from public.invoices i
join public.guardians g on g.id = i.guardian_id
left join public.charges ch on ch.invoice_id = i.id and ch.void = false
where i.created_at > now() - interval '1 minute'
group by i.id, g.full_name, i.total_amount;
rollback;
```

Review the output against expectations for the tenant's actual family roster
before removing the `rollback;` (or running for real without the
transaction wrapper). Alternatively, run this against a staging copy of the
database if one exists. This matters most for the very first live run: the
existing checks above (sections 1-9) exercise the logic with hand-picked
test tenants/children, but this is the first point where the ~29 real
families on the live tenant see charges generated against their live
guardians.

## 11. Overpayment credits (spec §91/§141)

`20260814120600_overpayment_credits.sql` adds `charges.guardian_id` and
`charges.source_invoice_id`, drops the `not null` on `charges.child_id`, and
adds `charges_child_or_guardian` (every charge has a child or a guardian,
never neither) plus the `charges_source_invoice_key` partial unique index
(at most one live credit per source invoice).
`20260814120700_attach_pending_credits.sql` replaces
`generate_recurring_charges_impl` to also attach any pending credit for a
guardian onto their newly-resolved invoice each run.
`20260814120800_guard_paid_invoice_credit_attach.sql` (fix round 1,
Important) replaces it again to add one guard to that attach step: it now
only attaches a credit to an invoice with `amount_paid = 0`, closing a
double-credit path where attaching to an already-paid invoice created a
fresh overpayment on it that the app would then let a director credit a
second time. This logic is entirely in SQL/trigger territory and cannot be
exercised by Vitest — verify it here, against a real database, before
trusting it in production. `applyOverpaymentCredit` in
`src/lib/billing/actions.ts` is the only insert path for a credit charge;
everything below assumes it (or an equivalent manual insert) was used to
create the credit.

**11a. Double-applying a credit yields exactly ONE credit row.** Find (or
create, by recording a payment larger than an invoice's `total_amount`) an
overpaid invoice, then click "Apply $X.XX as a credit" on
`/billing/<invoiceId>` twice in a row (or simulate the race directly in SQL):

```sql
select id, source_invoice_id, parent_amount, void
from public.charges
where source_invoice_id = '<OVERPAID_INVOICE_ID>' and type = 'credit';
```

Expected: **exactly one** row, `void = false`, `parent_amount` equal to the
negative of the overpayment excess. The second application attempt should
have surfaced "A credit has already been applied for this overpayment."
(the app's 23505 handling), not a generic error, and not a second row —
`charges_source_invoice_key` is what makes the second insert fail at the
database layer regardless of what the app does with the error.

**11b. A credit stays unattached until a generation run, then attaches to
the guardian's new invoice.** Immediately after applying a credit:

```sql
select id, guardian_id, invoice_id, parent_amount
from public.charges
where source_invoice_id = '<OVERPAID_INVOICE_ID>' and type = 'credit';
```

Expected: `invoice_id is null` — the credit is pending, not yet on any
invoice. `/billing/guardians/<guardianId>` should show "Pending credit:
$X.XX — applies to their next invoice" for this amount. Then run
`generate_recurring_charges('<TENANT_ID>'::uuid, '<NEXT_PERIOD_START>'::date)`
for a date that opens (or reuses) an invoice for this same guardian, and
re-run the query above:

Expected: `invoice_id` now points at the guardian's newly-generated invoice
for that period, and the pending-credit line on the guardian's balance page
is gone (the credit is now reflected in that invoice's total instead).

**11c. Attachment recalculates the invoice total correctly.** Before and
after the generation run from 11b:

```sql
select id, total_amount, amount_paid, status
from public.invoices
where id = '<NEW_INVOICE_ID>';
```

Expected: `total_amount` equals the sum of that invoice's live charges'
`parent_amount` — the new tuition charge(s) plus the (negative)
credit — matching what `recalc_invoice_totals` computes, with no manual
recalc call involved (it's called automatically inside
`generate_recurring_charges_impl` after the credit-attachment `update`, and
again via the `charges_recalc_invoice_totals` trigger that fires on that
same `update` — both should agree and settle on the same final total).

**11d. A credit larger than the new invoice's tuition leaves it `paid`, not
negative.** Engineer (or find) a case where a guardian's pending credit
exceeds the tuition charge(s) on their next generated invoice — e.g. a large
overpayment credit against a child with a small weekly rate. After the
generation run attaches the credit:

```sql
select total_amount, amount_paid, status
from public.invoices
where id = '<NEW_INVOICE_ID>';
```

Expected: `total_amount <= 0` and `status = 'paid'` — `recalc_invoice_totals`'s
`v_total <= 0` branch (20260814120100_billing_generation.sql) forces `paid`
whenever the live charges sum to zero or less, so the invoice never reads as
a negative balance owed to the family. Confirm no downstream balance figure
(`/billing`, `/billing/revenue`, `/dashboard`, the guardian's balance page)
shows a negative number for this invoice or this family.

**11e. `charges_child_or_guardian` and nullable `child_id` didn't break
anything else.** Confirm ordinary (non-credit) charges are unaffected:

```sql
select count(*) from public.charges where child_id is null and type <> 'credit';
```

Expected: `0` — nothing except a credit charge should ever have a null
`child_id`. Also confirm the invoice detail page renders a credit charge's
line item as "Family credit" (not "Unknown") and every other child-scoped
line item still shows the correct child's name.

**11f. Cross-tenant attach isolation.** This repo's repeat failure mode is a
tenant filter that looks right but doesn't actually scope a query — prove it
here rather than trusting the `and tenant_id = p_tenant_id` in the attach
`update`. With two tenants present (A and B):

```sql
-- Create a pending credit for a guardian in tenant A (via
-- applyOverpaymentCredit, or a manual insert with tenant_id/guardian_id set
-- to a tenant A guardian and invoice_id null), then run generation for
-- tenant B only:
select public.generate_recurring_charges('<TENANT_B_ID>'::uuid, '<SOME_DATE>'::date);

select id, tenant_id, guardian_id, invoice_id
from public.charges
where type = 'credit' and void = false and tenant_id = '<TENANT_A_ID>'::uuid;
```

Expected: tenant A's credit still has `invoice_id is null` — a tenant B
generation run must never attach it, even if tenant B happened to share a
guardian id by coincidence (it won't, but the query should prove tenant
scoping, not just guardian scoping). Then run generation for tenant A with
an eligible child/invoice and confirm the same credit *does* attach.

**11g. Function-definition comparison — confirm the reproduction is exact
apart from the intended diff.** Before applying `20260814120700` (or
`20260814120800`), capture the currently-live definition:

```sql
select pg_get_functiondef('public.generate_recurring_charges_impl(uuid, date)'::regprocedure);
```

Save the output. After applying the migration, run the same query again and
diff the two. Expected: the only differences are the credit-attach block
(the `update public.charges ... where invoice_id is null` statement, plus —
after `20260814120800` — its added `and exists (select 1 from
public.invoices i where i.id = v_invoice_id and i.amount_paid = 0)` clause)
and comments. Every clamp (`greatest`/`least` on `v_subsidy`/`v_parent`),
every exception handler (`when unique_violation`), the proration math, and
the final `revoke` line must be byte-identical to the version being
replaced — if anything else moved, the reproduction lost or altered
existing behavior and must not be trusted.

**11h. A credit does NOT attach to an already-paid invoice.** The fix-round-1
regression test for the Important finding above. Set up (or find) an
invoice that is fully paid (`amount_paid = total_amount`, `status = 'paid'`)
for a guardian who also has a pending credit from a *different*, unrelated
overpayment:

```sql
select id, total_amount, amount_paid, status from public.invoices where id = '<PAID_INVOICE_ID>';
select id, invoice_id from public.charges where id = '<PENDING_CREDIT_ID>' and type = 'credit';
```

Run generation for a date/tenant that resolves `<PAID_INVOICE_ID>` again for
this guardian (e.g. a "Generate now" click mid-period reusing that same
period's invoice), then re-check both:

```sql
select id, total_amount, amount_paid, status from public.invoices where id = '<PAID_INVOICE_ID>';
select id, invoice_id from public.charges where id = '<PENDING_CREDIT_ID>' and type = 'credit';
```

Expected: `<PAID_INVOICE_ID>`'s `total_amount`/`amount_paid`/`status` are
**unchanged**, and the credit's `invoice_id` is **still null** — the credit
must not have attached, and the paid invoice must not have become newly
overpaid. Confirm `/billing/<PAID_INVOICE_ID>` shows no amber overpayment
banner. Then, separately, confirm the legitimate case still works: an
**existing but unpaid** (`amount_paid = 0`) invoice for the same guardian
should still receive the credit on the next generation run (this is exactly
11b, re-run against a reused rather than brand-new invoice, to confirm the
guard is keyed on `amount_paid`, not on "was this invoice created this
run").
