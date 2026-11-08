import {
  INTENSIVE,
  eventStartUTC,
  isInPerson,
  isWaitlist,
} from "@/lib/intensive/config";

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
  /**
   * Attach the .ics. Off for the morning-of note: the event is hours away,
   * so a calendar invite is either already saved or too late to be useful,
   * and an attachment on a "leaving now" email is just noise.
   */
  attachCalendar: boolean;
}

/**
 * Canonical public URL, used for the "add to calendar" link in emails.
 * Emails have no request to derive a host from, so this is the one place a
 * funnel URL is written down rather than inferred.
 */
export const PUBLIC_ORIGIN = "https://akpadaycareblueprint.com";

export const CALENDAR_URL = `${PUBLIC_ORIGIN}/intensive/calendar.ics`;

/**
 * Attachment plus a link, deliberately both. Gmail and Apple Mail turn an
 * .ics attachment into a one-tap "Add to calendar" chip, but plenty of
 * clients (and most webmail on mobile) just show a file the reader has to
 * download and open. The link is the fallback that always works.
 */
function calendarBlock(): string {
  return `
      <p style="margin:0 0 18px;">
        <a href="${CALENDAR_URL}"
           style="display:inline-block;background:#0A0A0D;color:#F5F3EE;text-decoration:none;
                  padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600;">
          Add to calendar
        </a>
      </p>
      <p style="color:#64748B;font-size:12.5px;line-height:1.6;margin:0 0 18px;">
        The calendar file is attached too — open it to save the date, or use the button above.
      </p>`;
}

export const REMINDER_STAGES: ReminderStage[] = [
  {
    id: "week",
    daysBefore: 7,
    subject: `One week out — ${INTENSIVE.name}`,
    lead: (name) =>
      `${name}, we're one week out. Start pulling together the numbers you already have — a rent quote, a space you're considering, a budget you drafted. The more you bring, the more we can work on rather than talk about.`,
    attachCalendar: true,
  },
  {
    id: "day",
    daysBefore: 1,
    subject: `Tomorrow — ${INTENSIVE.name}`,
    lead: (name) =>
      `${name}, it's tomorrow. Doors open at ${INTENSIVE.doorsOpen} and we start on time at noon. Bring your state, your numbers, and something to write with.`,
    attachCalendar: true,
  },
  {
    id: "morning",
    daysBefore: 0,
    subject: `Today — doors open at ${INTENSIVE.doorsOpen}`,
    lead: (name) =>
      `${name}, today's the day. Doors open at ${INTENSIVE.doorsOpen} and we start at noon sharp. See you there.`,
    attachCalendar: false,
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

      ${stage.attachCalendar ? calendarBlock() : ""}

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

// ── Confirmation email ───────────────────────────────────────────────────
// Lives here rather than inline in the webhook so every buyer-facing
// template has one home, and so a preview renders byte-identical output to
// what production sends. An inline template can silently drift from
// whatever you thought you were previewing.

export interface ConfirmationDetails {
  firstName: string;
  amountCents: number;
  currency: string;
}

export const confirmationSubject = isWaitlist
  ? `You're in — your seat at ${INTENSIVE.name}`
  : `You're in — ${INTENSIVE.name}, ${INTENSIVE.dateLabel}`;

export function confirmationHtml({
  firstName,
  amountCents,
  currency,
}: ConfirmationDetails): string {
  const paid = `$${(amountCents / 100).toFixed(2)} ${String(currency).toUpperCase()}`;

  // Paid after the last session, before the next date exists. Promising a date
  // that has already passed -- with a calendar invite for it -- is worse than
  // sending nothing, so this says plainly what they have bought and what
  // happens next. No .ics either: there is no date to put in it.
  if (isWaitlist) {
    return `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;color:#0F172A;">
        <h1 style="font-size:22px;margin:0 0 12px;">${firstName}, you're in.</h1>
        <p style="line-height:1.6;color:#334155;margin:0 0 16px;">
          Your seat at <strong>${INTENSIVE.name}</strong> is reserved for the next session.
        </p>
        <p><strong>Date:</strong> to be announced</p>
        <p><strong>Paid:</strong> ${paid} · one payment</p>
        <p style="line-height:1.6;color:#334155;">
          The next date is being scheduled. You are paid and on the list, so you will get the
          date, the venue and the running order by email before any of it goes public —
          there is nothing else for you to do.
        </p>
        <p style="color:#64748B;font-size:13px;line-height:1.6;">
          Questions? Reply to this email or call ${INTENSIVE.phone}.
        </p>
      </div>
    `;
  }

  const whereBlock = isInPerson
    ? `<p><strong>Where:</strong> ${INTENSIVE.venue.name}<br />${INTENSIVE.venue.address}</p>`
    : INTENSIVE.zoom.link
      ? `<p><strong>Zoom:</strong> <a href="${INTENSIVE.zoom.link}">${INTENSIVE.zoom.link}</a></p>`
      : `<p><strong>Zoom:</strong> your link is on its way — it is issued closer to the date.</p>`;

  return `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;color:#0F172A;">
        <h1 style="font-size:22px;margin:0 0 12px;">${firstName}, you're in.</h1>
        <p style="line-height:1.6;color:#334155;margin:0 0 16px;">
          Your seat at <strong>${INTENSIVE.name}</strong> is confirmed.
        </p>
        <p><strong>Date:</strong> ${INTENSIVE.dateLabel}</p>
        <p><strong>Time:</strong> 12:00 PM – 5:00 PM Eastern (${INTENSIVE.timezoneLabel}) · doors open ${INTENSIVE.doorsOpen}</p>
        ${whereBlock}
        <p><strong>Paid:</strong> $${(amountCents / 100).toFixed(2)} ${String(currency).toUpperCase()} · one payment</p>
        ${calendarBlock()}
        <p style="line-height:1.6;color:#334155;">
          Bring your state, any numbers you already have, and something to write with.
          Doors open at ${INTENSIVE.doorsOpen} — come early and get settled.
        </p>
        <p style="color:#64748B;font-size:13px;line-height:1.6;">
          Questions? Reply to this email or call ${INTENSIVE.phone}.
        </p>
      </div>
    `;
}
