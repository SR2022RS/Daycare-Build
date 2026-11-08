import * as z from "zod";

export const RegistrationSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, {
      error: "We need both names as they should appear on your materials.",
    })
    .max(80),
  lastName: z
    .string()
    .trim()
    .min(1, {
      error: "We need both names as they should appear on your materials.",
    })
    .max(80),
  // Trim, THEN validate. z.email().trim() checks the raw string first, so an
  // address pasted or typed on a phone with a leading or trailing space was
  // bounced as malformed instead of being cleaned up -- on the path where
  // somebody is trying to pay.
  email: z
    .string()
    .trim()
    .pipe(
      z
        .email({
          error:
            "That email does not look right — your confirmation and materials go there.",
        })
        .max(200),
    ),
});

export type RegistrationInput = z.infer<typeof RegistrationSchema>;

/**
 * `unavailable` is a first-class outcome, not an error: it is what the
 * checkout returns while payments are not configured yet. The form renders
 * it as a plain notice with a way to reach a human, never as a red failure.
 */
export type CheckoutResult =
  | { status: "redirect"; url: string }
  | {
      status: "invalid";
      errors: { firstName?: string[]; lastName?: string[]; email?: string[] };
    }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

export type CheckoutFormState = CheckoutResult | undefined;

export type PaymentStatus = "pending" | "paid" | "refunded" | "failed";

export interface Registration {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  checkoutSessionId: string;
  /** Which session this seat is for; "next" while no date is announced. */
  cohort: string;
  createdAt: string;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Failed",
};

/**
 * The waitlist form, used between sessions. Same three fields as checkout,
 * but the copy has to promise something different: nothing is being bought,
 * so the email is where an announcement goes, not where a receipt goes.
 */
export const WaitlistSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, {
      error: "Tell us your first name so Shikara knows who she is writing to.",
    })
    .max(80),
  lastName: z
    .string()
    .trim()
    .min(1, {
      error: "Tell us your last name so Shikara knows who she is writing to.",
    })
    .max(80),
  // Trimmed before validating -- see the note on RegistrationSchema above.
  email: z
    .string()
    .trim()
    .pipe(
      z
        .email({
          error:
            "That email does not look right — the next date goes to this address.",
        })
        .max(200),
    ),
});

export type WaitlistInput = z.infer<typeof WaitlistSchema>;

export type WaitlistResult =
  | { status: "joined"; message: string }
  | {
      status: "invalid";
      errors: { firstName?: string[]; lastName?: string[]; email?: string[] };
    }
  | { status: "error"; message: string };

export type WaitlistFormState = WaitlistResult | undefined;
