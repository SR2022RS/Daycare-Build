# Billing Engine — Design Spec

**Status:** Approved for planning
**Date:** 2026-08-14
**Author:** Claude (with AKPA University director)
**Scope:** Money Module Steps 3–5 (per `supabase/migrations/20260802224828_children_and_guardians.sql`) — charges, invoices, manual payment recording, revenue dashboard, and the director/staff portal surface for all of it.

## Context

`children` and `guardians` (Money Module Step 2) already model `weekly_rate`, `rate_note`, and `cadence`, with a comment noting these tables are the foundation for "the charges/payments engine and revenue dashboard (Steps 3-5)" and that they should be extended, not forked. This spec is that extension.

A companion platform audit (comparing AKPA University against Procare, Brightwheel, HiMama, Kinderlime, EZCare, LifeCubby, CloudBB, and iCare) found billing to be the single highest-priority gap: the app currently has no invoicing, ledger, or payment tracking of any kind — only static rate fields.

## Goals

- Give directors a working ledger: know what every family owes, generate recurring tuition charges automatically, and record payments as they come in (by cash, check, Zelle, Venmo, or other manual method).
- Support the 4Cs/mixed-funding subsidy split, so a family's invoice reflects only their copay, with the subsidized portion tracked separately.
- Surface all of this in the existing director/staff portal — nav, invoice screens, a family balance view, a revenue dashboard, and a lightweight balance-status signal for staff.
- Build the schema so that a future Stripe integration (online collection) is additive, not a rework.

## Non-goals (explicitly out of scope for this spec)

- **Online payment collection.** No Stripe Checkout, payment links, or webhooks in this phase. Confirmed via the Vercel Marketplace (`vercel integration discover --category payments`) that Stripe is the correct future provider when that phase is scoped — it is not installed or wired up here.
- **Parent-facing portal or login.** No parent role, parent auth, or parent self-service view of invoices/balances. That is a separate, larger architectural project (new auth flow, new role, new route group) and was explicitly deferred.
- **Tenant-configurable billing settings** (custom due-date offsets, custom period boundaries). Periods are fixed calendar boundaries for all tenants in this phase.
- **Discount rule engines** (automatic sibling discounts, promo codes). Discounts/credits are supported as manually-entered charge rows, not computed automatically.

## Data model

### Extend `children`

Add one column:

- `subsidy_weekly_amount numeric(10,2)` — nullable; set only for `funding_type in ('4cs', 'mixed')`. Represents the portion of `weekly_rate` covered by subsidy. Parent copay = `weekly_rate - subsidy_weekly_amount`. For `funding_type = 'private'`, this stays null and the full `weekly_rate` is the parent's charge.

### New table: `charges`

The ledger's line items — every dollar owed, in or out, is a row here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id`, `location_id` | uuid | denormalized from `children`, matches existing RLS pattern |
| `child_id` | uuid references `children` | |
| `type` | enum `charge_type`: `tuition`, `fee`, `credit`, `adjustment` | |
| `period_start`, `period_end` | date, nullable | set for `tuition`; optional for other types |
| `description` | text | auto-generated for `tuition` (e.g. "Weekly tuition Aug 17–23"), required for manual types |
| `subsidy_amount` | numeric(10,2) not null default 0 | |
| `parent_amount` | numeric(10,2) not null default 0 | what's actually invoiced; negative for `credit` |
| `invoice_id` | uuid references `invoices`, nullable | set once grouped |
| `created_by` | uuid references `profiles`, nullable | null = system-generated (cron) |
| `void`, `voided_at` | boolean, timestamptz | corrections happen via void + a new charge, never a hard delete |
| `created_at` | timestamptz | |

**Idempotency constraint:** a partial unique index on `(child_id, period_start)` where `type = 'tuition' and void = false` — reruns of the generation job cannot double-charge a period.

### New table: `invoices`

One per paying guardian per period, grouping that cycle's charges.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id`, `location_id` | uuid | |
| `guardian_id` | uuid references `guardians` | the payer (`child_guardians.is_payer = true`) |
| `period_start`, `period_end` | date | |
| `status` | enum `invoice_status`: `open`, `partial`, `paid`, `void` | |
| `total_amount` | numeric(10,2) | sum of associated charges' `parent_amount`; recomputed via trigger when a charge is added/voided against it |
| `amount_paid` | numeric(10,2) not null default 0 | updated when a payment is recorded |
| `due_date` | date | |
| `created_at` | timestamptz | |

**Grouping rule:** when a charge is generated (recurring or manual), find the guardian's open invoice covering that period; if none exists, create one and attach the charge.

### New table: `payments`

Manual payment recording against an invoice.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | uuid | |
| `invoice_id` | uuid references `invoices` | |
| `amount` | numeric(10,2) | |
| `method` | enum `payment_method`: `cash`, `check`, `zelle`, `venmo`, `other` | reserve room to add `stripe` in the future phase without a schema rework |
| `paid_at` | date | |
| `recorded_by` | uuid references `profiles` | |
| `note` | text, nullable | |
| `created_at` | timestamptz | |

Inserting a payment updates `invoices.amount_paid` and recomputes `status` (`open` → `partial` → `paid`). Overpayment does not produce a negative invoice balance — the excess becomes a `credit`-type charge attached to the guardian's next invoice.

### New view: `child_balance_status`

Staff-visible, no dollar amounts. Computes `balance_status` (`current` / `overdue`) per child from the guardian's open invoices. Has its own RLS policy granting `staff` role `SELECT`, scoped to their tenant/location — the underlying `charges`/`invoices`/`payments` tables remain director/platform_admin-only.

## Charge generation mechanism

A SQL function, `generate_recurring_charges()`, runs daily via `pg_cron`.

**Period anchoring (calendar-based):**
- Weekly: Monday–Sunday
- Monthly: 1st–end of month
- Biweekly: fixed to the month's 1st and 3rd Monday for every biweekly child (matches the existing `CADENCE_LABELS.biweekly = "Bi-weekly (1st & 3rd Mondays)"` label already shown in the child detail page — discovered during plan-grounding, corrected here rather than left inconsistent with shipped UI copy). Period A runs 1st Monday through the day before the 3rd Monday (13 days); Period B runs 3rd Monday through the day before next month's 1st Monday (14–18 days depending on the month).

**Per active child with `weekly_rate` set, each run:**
1. Compute today's period boundaries for the child's `cadence`.
2. Skip if today isn't the start of a new period for that cadence.
3. Skip if a non-voided `tuition` charge already exists for `(child_id, period_start)` (idempotency).
4. If `start_date` falls inside this period (i.e., this is the child's first period), prorate `parent_amount` and `subsidy_amount` by day-count instead of charging the full period.
5. Split the period amount into `subsidy_amount` / `parent_amount` per `funding_type` and `subsidy_weekly_amount`.
6. Create the `charges` row, then attach it to the guardian's open invoice for that period (creating one if none exists).

Inactive/withdrawn children (`status != 'active'`) are skipped entirely — no charges generate for periods after a status change.

## Portal surface

Nav gains a new **Billing** section (director/platform_admin only), placed between Children and Safety in `src/lib/nav/nav-items.ts`.

| Route | Purpose |
|---|---|
| `/billing` | Invoice list — filter/search by family, status, period. Includes a manual "Generate now" action alongside the cron job, for backfilling or forcing an early run. |
| `/billing/[invoiceId]` | Invoice detail — line items, payment history, "Record payment" action. |
| `/billing/guardians/[guardianId]` | A family's running balance across all their children — charge history, invoice history, current balance. |
| `/billing/revenue` | Dashboard — billed vs. collected for the current period, aging balance by family, subsidy amounts pending (labeled clearly as informational, not part of what the family owes). |

**Existing pages updated:**
- `/children/[childId]` — add the `subsidy_weekly_amount` field next to `weekly_rate`/`cadence`; add a "View billing" link into that child's guardian balance (director/platform_admin view) or a "Balance: Current/Overdue" badge with no dollar amount (staff view).
- `/dashboard` — one new stat tile, "Outstanding balance" (or overdue invoice count), matching the existing pattern of "Not cleared for solo supervision" / "Credentials expiring" tiles.

## Security / RLS

All new tables follow the existing `children`/`guardians` pattern exactly: `tenant_id = current_tenant_id() and current_role() in ('director', 'platform_admin')` for both `select` and write policies. The one exception is the `child_balance_status` view, which additionally grants `staff` a `select`-only policy limited to the computed status column — never the underlying financial tables.

## Error handling & edge cases

- **Double-charging:** prevented by the partial unique index on `charges (child_id, period_start)` for `type = 'tuition'`.
- **Corrections:** never hard-delete a financial record. Void the charge/invoice and create a new one if a correction is needed.
- **Overpayment:** becomes a `credit` charge on the next invoice rather than a negative balance.
- **Rate changes mid-relationship:** no rate-history table needed — each `charges` row is itself a snapshot of the rate in effect when it was generated.
- **Status changes mid-cycle (withdrawal):** the generation function only considers `status = 'active'` children; no charge is created for periods after a child goes inactive. Already-generated charges for prior periods are untouched.
- **Manual "Generate now":** must call the same idempotent function as the cron job, so it can never produce a duplicate for a period the cron already covered.

## Testing approach

- SQL-level tests for `generate_recurring_charges()`: idempotency (running twice in a row produces no duplicate charges), proration math on a partial first period, and correct subsidy/parent split for each `funding_type`.
- RLS policy tests confirming `staff` can read `child_balance_status` but cannot read `charges`/`invoices`/`payments` directly, and confirming cross-tenant isolation.
- Invoice/payment lifecycle tests: partial payment moves status to `partial`, full payment moves it to `paid`, overpayment creates a `credit` charge rather than a negative balance.
- Follow whatever test runner/conventions the implementation phase finds already in use in this repo (to be confirmed during planning — no test framework was assumed here).

## Future work (not this spec)

- Stripe Checkout/Payment Links per invoice, with webhook-driven reconciliation into `payments` (the `payment_method` enum already reserves `stripe` for this).
- Parent-facing portal with self-service payment and balance visibility.
- Tenant-configurable billing periods/due-date offsets.
- Automated discount rules (e.g. sibling discounts) instead of manual `credit` charges.
