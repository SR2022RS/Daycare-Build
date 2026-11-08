"use client";

import { useState, useTransition } from "react";

import { INTENSIVE } from "@/lib/intensive/config";
import { joinWaitlist } from "@/lib/intensive/actions";
import type { WaitlistFormState } from "@/lib/intensive/definitions";

const labelClass =
  "mb-[7px] block text-[10.5px] font-semibold uppercase tracking-[.16em] text-[#8C857C]";

function inputClass(invalid: boolean) {
  return [
    "h-[46px] w-full rounded-lg bg-[#17171C] px-3.5 text-[15px] text-[#F5F3EE] outline-none",
    "border transition-colors focus:border-brand-primary",
    invalid ? "border-[rgba(180,35,24,.6)]" : "border-[rgba(227,12,123,.22)]",
  ].join(" ");
}

/**
 * Collects a name for the next session while none is scheduled.
 *
 * Not useActionState, for the same reason the checkout form avoids it: an
 * action dispatched through that hook carries React's form reset, which blanks
 * controlled inputs after it resolves and would make a bounced typo cost
 * somebody all three fields.
 */
export function WaitlistForm() {
  const [state, setState] = useState<WaitlistFormState>(undefined);
  const [pending, startTransition] = useTransition();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setState(await joinWaitlist(formData));
    });
  }

  const errors = state?.status === "invalid" ? state.errors : undefined;

  if (state?.status === "joined") {
    return (
      <div
        aria-live="polite"
        className="rounded-[14px] border border-[rgba(62,142,65,.45)] bg-[rgba(62,142,65,.1)] px-5 py-[22px]"
      >
        <p className="font-serif text-[19px] text-[#F5F3EE]">
          You&rsquo;re on the list.
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-[#B8B2A9]">
          {state.message}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-[#8C857C]">
          Nothing has been charged, and you are not booked into anything.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-[rgba(227,12,123,.22)] bg-[rgba(16,16,20,.72)] px-5 py-[22px]">
      <p className="font-serif text-[18px] font-semibold text-[#F5F3EE]">
        Be first to know the next date
      </p>
      <p className="mt-2 mb-[18px] text-[13.5px] leading-relaxed text-[#8C857C]">
        The next session isn&rsquo;t scheduled yet. Leave your name and Shikara
        will send you the date, the venue and the price before it goes public.
      </p>

      <form onSubmit={onSubmit} noValidate>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="wl-firstName" className={labelClass}>
              First name
            </label>
            <input
              id="wl-firstName"
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
            <label htmlFor="wl-lastName" className={labelClass}>
              Last name
            </label>
            <input
              id="wl-lastName"
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
          <label htmlFor="wl-email" className={labelClass}>
            Email
          </label>
          <input
            id="wl-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors?.email)}
            className={inputClass(Boolean(errors?.email))}
          />
        </div>

        <div aria-live="polite">
          {(errors?.firstName || errors?.lastName || errors?.email) && (
            <div className="mt-4 rounded-lg border border-[rgba(180,35,24,.45)] bg-[rgba(180,35,24,.12)] px-3.5 py-3 text-[13.5px] leading-snug text-[#FFB4AC]">
              {errors.firstName?.[0] ??
                errors.lastName?.[0] ??
                errors.email?.[0]}
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
          disabled={pending}
          className="intensive-cta mt-[20px] flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[10px] font-serif text-[15.5px] font-bold tracking-[.05em] text-white"
        >
          {pending ? (
            <>
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
              />
              Adding you…
            </>
          ) : (
            "Join the waitlist"
          )}
        </button>
      </form>

      <p className="mt-3.5 text-center text-xs leading-relaxed text-[#8C857C]">
        No payment, no obligation · questions:{" "}
        <a
          href={`mailto:${INTENSIVE.contactEmail}`}
          className="hover:text-[#3CC0D8]"
        >
          {INTENSIVE.contactEmail}
        </a>
      </p>
    </div>
  );
}
