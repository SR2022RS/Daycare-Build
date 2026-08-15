-- Overpayment credits (spec §91/§141): an overpayment on an invoice should
-- become a family-level credit charge carried onto the guardian's next
-- invoice, rather than a negative invoice balance or an invisible excess.
-- Extends the `charges` table from 20260814120000_billing_engine.sql. This
-- is a NEW file, not an edit to that migration -- Supabase will not
-- re-apply an already-applied version, and whether it has been applied to
-- the live database yet is unknown from here.
--
-- An overpayment belongs to the paying guardian (the family), not to any
-- one child -- a family with three enrolled children who overpays hasn't
-- overpaid on behalf of one specific child. `charges.child_id` was
-- `not null`, modeling every charge as child-scoped; that assumption no
-- longer holds once a charge can be family-level, so it's relaxed here
-- rather than forcing a family credit to point at an arbitrary child.

alter table public.charges
  add column guardian_id uuid references public.guardians (id) on delete cascade;

-- Relaxing NOT NULL is safe on live data -- it only widens what's allowed,
-- it can't invalidate any existing row.
alter table public.charges
  alter column child_id drop not null;

-- The overpaid invoice this credit was generated from. Lets the invoice
-- detail page answer "has a credit already been applied to this specific
-- overpayment" and lets a director trace a credit back to its source,
-- without a fragile description-string match.
alter table public.charges
  add column source_invoice_id uuid references public.invoices (id) on delete set null;

-- Every charge belongs to a child (ordinary tuition/fee/adjustment/credit)
-- or a guardian (a family-level overpayment credit) -- never neither, or a
-- charge would be unattributable to anyone's balance at all.
alter table public.charges
  add constraint charges_child_or_guardian
  check (child_id is not null or guardian_id is not null);

-- Idempotency for the credit itself: at most one live (non-void) credit per
-- source invoice, so a double click on "Apply credit" -- or any other
-- concurrent insert attempt against the same overpaid invoice -- cannot
-- double-credit the family. Partial on `type = 'credit' and void = false`
-- so voiding a mistaken credit and issuing a corrected one (the spec's only
-- correction mechanism: void + a new row, never a hard delete) is never
-- blocked by the old, now-voided row.
create unique index charges_source_invoice_key
  on public.charges (source_invoice_id)
  where type = 'credit' and void = false;

-- The generator's per-run lookup of "does this guardian have any pending
-- (unattached) credits" scans by guardian_id -- see
-- 20260814120700_attach_pending_credits.sql.
create index charges_guardian_id_idx on public.charges (guardian_id);
