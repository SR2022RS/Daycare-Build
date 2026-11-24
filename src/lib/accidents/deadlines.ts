/**
 * N.J.A.C. 3A:52-7.10(b): when an injury under the center's supervision
 * results in an emergency-room visit, a hospital admission, death, a 911
 * call, on-site or transported emergency care, or urgent care, the center
 * tells the Office of Licensing by the next working day and sends
 * documentation within one week.
 *
 * Weekends are skipped. Center holidays are not on this calendar.
 * Dates are calendar dates (YYYY-MM-DD), not instants, so the campus clock
 * does not shift them.
 */

function parseDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function nextWorkingDay(isoDate: string): string {
  const date = parseDate(isoDate);
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatDate(date);
}

export function documentationDue(isoDate: string): string {
  const date = parseDate(isoDate);
  date.setUTCDate(date.getUTCDate() + 7);
  return formatDate(date);
}

export interface OolDeadline {
  /** Verbal notice to the Office of Licensing. */
  verbalBy: string;
  /** Written documentation. */
  documentationBy: string;
}

export function oolDeadline(occurredOn: string): OolDeadline {
  return {
    verbalBy: nextWorkingDay(occurredOn),
    documentationBy: documentationDue(occurredOn),
  };
}
