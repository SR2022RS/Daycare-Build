"use client";

import { useEffect, useState, useTransition } from "react";

import { INTENSIVE } from "@/lib/intensive/config";
import { startRegistration } from "@/lib/intensive/actions";
import type { CheckoutFormState } from "@/lib/intensive/definitions";

const labelClass =
  "mb-[7px] block text-[10.5px] font-semibold uppercase tracking-[.16em] text-[#8C857C]";

function inputClass(invalid: boolean) {
  return [
    "h-[46px] w-full rounded-lg bg-[#17171C] px-3.5 text-[15px] text-[#F5F3EE] outline-none",
    "border transition-colors focus:border-brand-primary",
    invalid ? "border-[rgba(180,35,24,.6)]" : "border-[rgba(227,12,123,.22)]",
  ].join(" ");
}

export function CheckoutForm({ cancelled }: { cancelled: boolean }) {
  const [state, setState] = useState<CheckoutFormState>(undefined);
  const [pending, startTransition] = useTransition();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  /**
   * Deliberately not useActionState. An action dispatched through that hook
   * carries React's form-reset behaviour, which blanks the fields once the
   * action resolves -- and because these inputs are controlled, the reset
   * clears the DOM without moving React's value tracker, so they stay blank.
   * Every bounced typo would make someone paying $300 retype all three
   * fields. Awaiting the action inside a transition avoids the reset while
   * keeping the pending state.
   */
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setState(await startRegistration(formData));
    });
  }

  // A successful session hands back a Stripe-hosted URL on another origin,
  // so this is a full navigation, not a router push.
  useEffect(() => {
    if (state?.status === "redirect") {
      window.location.assign(state.url);
    }
  }, [state]);

  const errors = state?.status === "invalid" ? state.errors : undefined;
  const redirecting = state?.status === "redirect";

  return (
    <>
      {cancelled && (
        <div className="mb-5 rounded-[10px] border border-[rgba(60,192,216,.3)] bg-[rgba(60,192,216,.07)] px-[17px] py-[15px]">
          <p className="text-sm font-semibold text-[#7FDCEE]">No charge was made.</p>
          <p className="mt-[5px] text-[13.5px] leading-relaxed text-[#8C857C]">
            You closed the payment page before finishing. Nothing was taken — pick up where you left
            off whenever you&rsquo;re ready.
          </p>
        </div>
      )}

      <div className="rounded-[14px] border border-[rgba(227,12,123,.22)] bg-[#101014] px-6 py-[26px]">
        <h1 className="font-serif text-2xl font-semibold text-[#F5F3EE]">Reserve your seat</h1>
        <p className="mt-2.5 mb-[22px] text-sm leading-relaxed text-[#8C857C]">
          Three fields, then payment. Your confirmation and materials go to the email you enter
          here.
        </p>

        <div className="mb-6 flex items-baseline justify-between gap-4 rounded-[9px] border border-[rgba(227,12,123,.2)] bg-[rgba(227,12,123,.05)] px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-[#F5F3EE]">{INTENSIVE.name}</p>
            <p className="mt-[3px] text-[12.5px] text-[#8C857C]">{INTENSIVE.shortDate}</p>
          </div>
          <p className="font-serif text-[22px] text-[#FF4FA3]">${INTENSIVE.price}</p>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className={labelClass}>
                First name
              </label>
              <input
                id="firstName"
                name="firstName"
                autoComplete="given-name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                aria-invalid={Boolean(errors?.firstName)}
                className={inputClass(Boolean(errors?.firstName))}
              />
            </div>
            <div>
              <label htmlFor="lastName" className={labelClass}>
                Last name
              </label>
              <input
                id="lastName"
                name="lastName"
                autoComplete="family-name"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                aria-invalid={Boolean(errors?.lastName)}
                className={inputClass(Boolean(errors?.lastName))}
              />
            </div>
          </div>

          <div className="mt-[18px]">
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors?.email)}
              aria-describedby="email-hint"
              className={inputClass(Boolean(errors?.email))}
            />
            <p id="email-hint" className="mt-2 text-xs text-[#8C857C]">
              Your confirmation and materials go to this address.
            </p>
          </div>

          {/* One live region for every outcome, so a screen reader hears the
              result whether it was a validation slip or a payment problem. */}
          <div aria-live="polite">
            {(errors?.firstName || errors?.lastName || errors?.email) && (
              <div className="mt-4 rounded-lg border border-[rgba(180,35,24,.45)] bg-[rgba(180,35,24,.12)] px-3.5 py-3 text-[13.5px] leading-snug text-[#FFB4AC]">
                {errors.firstName?.[0] ?? errors.lastName?.[0] ?? errors.email?.[0]}
              </div>
            )}

            {state?.status === "unavailable" && (
              <div className="mt-4 rounded-lg border border-[rgba(240,216,24,.35)] bg-[rgba(240,216,24,.08)] px-3.5 py-3.5">
                <p className="text-[13px] font-bold uppercase tracking-[.12em] text-[#F0D818]">
                  Registration isn&rsquo;t open yet
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#D8D2C9]">
                  {state.message}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
                  <a
                    href={`mailto:${INTENSIVE.senderEmail}?subject=${encodeURIComponent(
                      `Seat for ${INTENSIVE.name}`,
                    )}`}
                    className="font-medium text-[#FF4FA3] underline underline-offset-4 hover:text-[#3CC0D8]"
                  >
                    {INTENSIVE.senderEmail}
                  </a>
                  <a
                    href={`tel:${INTENSIVE.phone.replace(/[^0-9+]/g, "")}`}
                    className="font-medium text-[#FF4FA3] underline underline-offset-4 hover:text-[#3CC0D8]"
                  >
                    {INTENSIVE.phone}
                  </a>
                </div>
              </div>
            )}

            {state?.status === "error" && (
              <div className="mt-4 rounded-lg border border-[rgba(180,35,24,.45)] bg-[rgba(180,35,24,.12)] px-3.5 py-3 text-[13.5px] leading-snug text-[#FFB4AC]">
                {state.message}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={pending || redirecting}
            className="intensive-cta mt-[22px] flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[10px] font-serif text-[15.5px] font-bold tracking-[.05em] text-white"
          >
            {pending || redirecting ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                />
                Opening secure checkout…
              </>
            ) : (
              `Continue to payment — $${INTENSIVE.price}`
            )}
          </button>
        </form>

        <p className="mt-3.5 text-center text-xs leading-relaxed text-[#8C857C]">
          Payment is handled by Stripe · Apple Pay and Google Pay accepted · we never see your card
        </p>
      </div>
    </>
  );
}
