import "server-only";

import { INTENSIVE, eventStartUTC, isInPerson } from "@/lib/intensive/config";

/**
 * Reminder schedule for the intensive.
 *
 * `daysBefore` is measured in whole days from the event's start. The cron
 * runs once a day, so a stage is due when today falls on its day -- not
 * when "now is within X hours", which would either fire repeatedly through
 * the day or miss entirely if a run were skipped.
 */
export interface ReminderStage {
  /** Stored in intensive_reminder_sends.stage; changing it re-sends. */
  id: string;
  daysBefore: number;
  subject: string;
  /** Lead paragraph. The shared details block is appended to all of them. */
  lead: (firstName: string) => string;
}

export const REMINDER_STAGES: ReminderStage[] = [
  {
    id: "week",
    daysBefore: 7,
    subject: `One week out — ${INTENSIVE.name}`,
    lead: (name) =>
      `${name}, we're one week out. Start pulling together the numbers you already have — a rent quote, a space you're considering, a budget you drafted. The more you bring, the more we can work on rather than talk about.`,
  },
  {
    id: "day",
    daysBefore: 1,
    subject: `Tomorrow — ${INTENSIVE.name}`,
    lead: (name) =>
      `${name}, it's tomorrow. Doors open at ${INTENSIVE.doorsOpen} and we start on time at noon. Bring your state, your numbers, and something to write with.`,
  },
  {
    id: "morning",
    daysBefore: 0,
    subject: `Today — doors open at ${INTENSIVE.doorsOpen}`,
    lead: (name) =>
      `${name}, today's the day. Doors open at ${INTENSIVE.doorsOpen} and we start at noon sharp. See you there.`,
  },
];

/**
 * Whole days between now and the event start, rounded to calendar days in
 * the event's own timezone. Using UTC midnight boundaries would put the
 * cutover at 8pm ET and fire the "tomorrow" email a day early.
 */
export function daysUntilEvent(now: number = Date.now()): number {
  const offsetMs = INTENSIVE.timezoneOffsetUTC * 60 * 60 * 1000;
  const startOfDay = (ms: number) => Math.floor((ms + offsetMs) / 86_400_000);
  return startOfDay(eventStartUTC()) - startOfDay(now);
}

/** The stage due today, or null when today is not a reminder day. */
export function stageDueToday(now: number = Date.now()): ReminderStage | null {
  const remaining = daysUntilEvent(now);
  return REMINDER_STAGES.find((s) => s.daysBefore === remaining) ?? null;
}

const where = isInPerson
  ? `${INTENSIVE.venue.name}<br />${INTENSIVE.venue.address}`
  : INTENSIVE.zoom.link || "Your Zoom link is on its way.";

export function reminderHtml(stage: ReminderStage, firstName: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;color:#0F172A;">
      <h1 style="font-size:21px;margin:0 0 12px;">${stage.subject}</h1>
      <p style="line-height:1.6;color:#334155;margin:0 0 18px;">${stage.lead(firstName)}</p>

      <table style="border-collapse:collapse;margin:0 0 18px;">
        <tr><td style="padding:3px 14px 3px 0;color:#64748B;">Date</td><td><strong>${INTENSIVE.dateLabel}</strong></td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#64748B;">Time</td><td>12:00 PM – 5:00 PM ${INTENSIVE.timezoneLabel} · doors ${INTENSIVE.doorsOpen}</td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#64748B;vertical-align:top;">Where</td><td>${where}</td></tr>
      </table>

      <p style="line-height:1.6;color:#334155;margin:0 0 18px;">
        Bring your state — or the state you plan to open in — any numbers you already have,
        and your current enrollment and tuition if you're already open.
      </p>

      <p style="color:#64748B;font-size:13px;line-height:1.6;margin:0;">
        Questions? Reply to this email or call ${INTENSIVE.phone}.
      </p>
    </div>
  `;
}
