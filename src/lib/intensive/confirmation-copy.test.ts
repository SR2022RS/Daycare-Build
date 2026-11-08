import { describe, expect, it } from "vitest";

import { INTENSIVE, isWaitlist } from "./config";
import { confirmationHtml, confirmationSubject } from "./reminders";

/**
 * The confirmation email has to be right in both of the funnel's states, and
 * which one is live is a config flag that flips between sessions. So these
 * assert the behaviour of whichever mode is configured, rather than assuming
 * one -- the failure mode worth guarding is a buyer being told a date that is
 * wrong for the seat they just bought.
 */

const details = { firstName: "Shonda", amountCents: 30000, currency: "usd" };

describe("confirmation copy", () => {
  it("always confirms what was paid and that the seat is theirs", () => {
    const html = confirmationHtml(details);
    expect(html).toContain("$300.00 USD");
    expect(html).toContain("Shonda");
  });

  if (isWaitlist) {
    // Seats sold before a date exists: never promise one, never attach a
    // calendar file for the session that has already happened.
    it("names no date while none is announced", () => {
      expect(confirmationSubject).not.toContain(INTENSIVE.dateLabel);
      expect(confirmationHtml(details)).not.toContain(INTENSIVE.dateLabel);
      expect(confirmationHtml(details)).toMatch(/to be announced/i);
    });

    it("offers no calendar file or add-to-calendar link", () => {
      const html = confirmationHtml(details);
      expect(html).not.toMatch(/add to calendar/i);
      expect(html).not.toMatch(/calendar\.ics/);
    });
  } else {
    // Selling a dated session: the date is the whole point of the email, and
    // it must match the one the page and the calendar file are advertising.
    it("names the configured date, in the subject and the body", () => {
      expect(confirmationSubject).toContain(INTENSIVE.dateLabel);
      expect(confirmationHtml(details)).toContain(INTENSIVE.dateLabel);
    });

    it("offers the calendar, both as a link and as an attachment", () => {
      const html = confirmationHtml(details);
      expect(html).toMatch(/add to calendar/i);
      expect(html).toContain("/intensive/calendar.ics");
    });

    it("does not still say the date is unknown", () => {
      expect(confirmationHtml(details)).not.toMatch(/to be announced/i);
    });
  }
});
