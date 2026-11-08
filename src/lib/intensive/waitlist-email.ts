import { INTENSIVE } from "@/lib/intensive/config";

export const waitlistSubject = `You're on the list — ${INTENSIVE.name}`;

/**
 * Sent the moment somebody joins the waitlist.
 *
 * Deliberately short and makes exactly one promise: they hear the date first.
 * It must not read like a receipt or a confirmed seat -- nothing has been
 * bought, and the next date does not exist yet.
 */
export function waitlistHtml(firstName: string): string {
  return [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#334155;line-height:1.6">`,
    `<h2 style="font-size:20px;color:#0F172A;margin:0 0 12px;">You're on the list, ${escapeHtml(firstName)}.</h2>`,
    `<p style="margin:0 0 14px;">The next <strong>${escapeHtml(INTENSIVE.name)}</strong> has not been scheduled yet. `,
    `When it is, you will get the date, the venue and the price before it goes public.</p>`,
    `<p style="margin:0 0 14px;">Nothing has been charged and you are not booked into anything — `,
    `this is a heads-up, and you decide when you see the date.</p>`,
    `<p style="margin:0 0 6px;color:#64748B;font-size:14px;">Questions in the meantime:</p>`,
    `<p style="margin:0 0 20px;font-size:14px;">`,
    `<a href="mailto:${escapeHtml(INTENSIVE.contactEmail)}" style="color:#E30C7B;">${escapeHtml(INTENSIVE.contactEmail)}</a>`,
    ` &middot; <a href="tel:${INTENSIVE.phone.replace(/[^0-9+]/g, "")}" style="color:#E30C7B;">${escapeHtml(INTENSIVE.phone)}</a>`,
    `</p>`,
    `<p style="margin:0;color:#64748B;font-size:13px;">${escapeHtml(INTENSIVE.host.name)} &middot; ${escapeHtml(INTENSIVE.host.title)}</p>`,
    `</div>`,
  ].join("");
}

/** Names come from a public form, so they are untrusted input in an email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
