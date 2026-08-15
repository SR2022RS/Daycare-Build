import * as z from "zod";

export const RegistrationSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, { error: "We need both names as they should appear on your materials." })
    .max(80),
  lastName: z
    .string()
    .trim()
    .min(1, { error: "We need both names as they should appear on your materials." })
    .max(80),
  email: z
    .email({ error: "That email does not look right — your confirmation and materials go there." })
    .trim()
    .max(200),
});

export type RegistrationInput = z.infer<typeof RegistrationSchema>;

/**
 * `unavailable` is a first-class outcome, not an error: it is what the
 * checkout returns while payments are not configured yet. The form renders
 * it as a plain notice with a way to reach a human, never as a red failure.
 */
export type CheckoutResult =
  | { status: "redirect"; url: string }
  | { status: "invalid"; errors: { firstName?: string[]; lastName?: string[]; email?: string[] } }
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
  createdAt: string;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Failed",
};
