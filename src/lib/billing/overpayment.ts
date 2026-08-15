// Spec §91/§141: an overpayment (amount_paid > total_amount) becomes a
// credit-type charge carried onto the guardian's next invoice, rather than
// a negative invoice balance. This is the pure math the server action
// re-derives from the invoice's own stored totals -- never from a
// client-supplied amount. Money columns are numeric(10,2), so the result is
// rounded to cents to avoid float drift (e.g. 100.05 - 70.10 in floating
// point is 29.949999999999996, not 29.95).
export function overpaymentExcess(totalAmount: number, amountPaid: number): number {
  const excess = amountPaid - totalAmount;
  if (excess <= 0) return 0;
  return Math.round(excess * 100) / 100;
}
