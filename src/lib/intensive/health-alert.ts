import type { Check } from "@/lib/intensive/health";

export interface AlertCopy {
  subject: string;
  headline: string;
  lead: string;
}

/**
 * Checks whose failure stops paid seats being recorded or confirmed, but does
 * not stop anybody paying. On the hosted path a buyer pays on the GHL payment
 * page and never touches our database or Resend.
 */
const RECORDING_ONLY = new Set(["database.registrations", "resend.domain"]);

/**
 * Words the daily alert by what actually broke.
 *
 * The old copy said "Customers cannot buy right now" for every failure. On
 * Sep 12 and Sep 14 a single database request timed out and the alert made
 * that claim while checkout worked the whole time. Only a failure on the path
 * a buyer actually takes may say they cannot buy.
 */
export function alertCopy(className: string, broken: Check[]): AlertCopy {
  if (broken.some((check) => !RECORDING_ONLY.has(check.name))) {
    return {
      subject: `ALERT: ${className} checkout is broken`,
      headline: "Customers cannot buy right now",
      lead: "The daily check found the purchase path broken. Anyone clicking the link is being turned away.",
    };
  }

  const effects: string[] = [];
  if (broken.some((check) => check.name === "database.registrations")) {
    effects.push("new paid seats won't reach the registrations list");
  }
  if (broken.some((check) => check.name === "resend.domain")) {
    effects.push("confirmation and reminder emails can't send");
  }

  return {
    subject: `ALERT: ${className} — registrations aren't being recorded`,
    headline: "People can still pay, but registrations aren't being recorded",
    lead:
      `The payment page is up, so buying still works. But ${effects.join(", and ")} ` +
      "until this is fixed. Anyone who pays in the meantime will need to be recorded by hand.",
  };
}
