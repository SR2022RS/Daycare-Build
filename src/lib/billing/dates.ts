// Single-tenant assumption: every AKPA center billed by this module today
// (CARI/CHRI/4Cs credentials) is in New Jersey, so one shared timezone is
// correct for now. If centers ever span timezones, this needs to become a
// per-tenant/location setting instead of a constant -- don't thread a
// timezone parameter through every call site pre-emptively for a need that
// doesn't exist yet.
export const CENTER_TIME_ZONE = "America/New_York";

// `new Date().toISOString().slice(0, 10)` reads the date in UTC, which is
// wrong for a US-Eastern center after ~7-8pm local (invoices due "today"
// render as overdue, aging adds a day, and an evening "Generate now" click
// near month-end can generate next month's charges early). en-CA formats as
// YYYY-MM-DD directly, so no further reformatting is needed.
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CENTER_TIME_ZONE }).format(new Date());
}
