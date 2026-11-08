import type { Metadata } from "next";
import Link from "next/link";

import { INTENSIVE, PREP_LIST, isInPerson } from "@/lib/intensive/config";
import { getRegistrationBySession } from "@/lib/intensive/queries";

export const metadata: Metadata = {
  title: `You're in — ${INTENSIVE.name}`,
  robots: { index: false, follow: false },
};

const CONFIRM_BACKGROUND =
  "radial-gradient(1px 1px at 20% 24%, rgba(227,12,123,.55), transparent 60%)," +
  "radial-gradient(1.5px 1.5px at 62% 66%, rgba(227,12,123,.35), transparent 60%)," +
  "radial-gradient(130% 95% at 10% 0%, rgba(227,12,123,.3) 0%, rgba(10,10,13,0) 64%)," +
  "#0A0A0D";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default async function IntensiveConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; order?: string }>;
}) {
  const { session_id: sessionId, order } = await searchParams;

  // Two identifiers because there are two payment paths. Stripe returns its
  // Checkout Session id; a GoHighLevel order form returns a GHL order id,
  // which the webhook stores prefixed so the two can never collide.
  //
  // Both are safe to accept from the URL for the same reason: they are long
  // unguessable ids, so knowing one is itself weak evidence you are the buyer.
  // Neither is trusted as proof of PAYMENT though -- that is read below from
  // our own row, which only the payment webhook can write. The query string
  // says "look this up", never "this was paid".
  const lookupKey = sessionId ?? (order ? `ghl_${order}` : null);
  const registration = lookupKey ? await getRegistrationBySession(lookupKey) : null;
  const confirmed = registration?.status === "paid";

  if (!confirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-ink px-6 py-16">
        <div className="max-w-[440px] text-center">
          <h1 className="font-serif text-[26px] font-semibold text-[#F5F3EE]">
            {registration ? "We're still confirming your payment" : "We can't find that seat"}
          </h1>
          <p className="mt-4 text-[15px] leading-[1.7] text-[#8C857C]">
            {registration
              ? "Your payment is going through. This page updates once the confirmation lands — refresh in a minute, and check your email either way."
              : `If you just paid, the confirmation can take a moment to reach us — refresh this page. If you have not registered yet, start from the details page. Anything else, email ${INTENSIVE.contactEmail}.`}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
            <Link
              href="/intensive"
              className="font-medium text-[#FF4FA3] underline underline-offset-4 hover:text-[#3CC0D8]"
            >
              Back to the details
            </Link>
            <a
              href={`mailto:${INTENSIVE.contactEmail}`}
              className="font-medium text-[#FF4FA3] underline underline-offset-4 hover:text-[#3CC0D8]"
            >
              {INTENSIVE.contactEmail}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const rows: { label: string; value: string; strong?: boolean }[] = [
    {
      label: "Registered",
      value: `${registration.firstName} ${registration.lastName}`,
      strong: true,
    },
    { label: "Date", value: INTENSIVE.dateLabel, strong: true },
    {
      label: "Time",
      value: `12:00 PM – 5:00 PM Eastern (${INTENSIVE.timezoneLabel}) · five hours · room opens ${INTENSIVE.doorsOpen}`,
    },
    isInPerson
      ? { label: "Where", value: `${INTENSIVE.venue.name}, ${INTENSIVE.venue.address}` }
      : {
          label: "Zoom",
          value:
            INTENSIVE.zoom.link ||
            `Your Zoom link is on its way to ${registration.email} — it is issued closer to the date.`,
        },
    {
      label: "Paid",
      value: `${money(registration.amountCents, registration.currency)} · one payment · receipt from Stripe`,
    },
    {
      label: "Replay",
      value: INTENSIVE.replay.included
        ? `Included for ${INTENSIVE.replay.days} days after the session`
        : "Not included — this session is live only",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="px-6 pt-11 pb-10" style={{ background: CONFIRM_BACKGROUND }}>
        <div className="mx-auto max-w-[620px]">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-[rgba(62,142,65,.5)] bg-[rgba(62,142,65,.14)] px-3.5 py-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#7BD07F]" />
            <span className="text-[10.5px] font-bold uppercase tracking-[.16em] text-[#7BD07F]">
              Payment confirmed
            </span>
          </p>
          <h1 className="mt-5 font-serif text-[32px] font-semibold leading-tight text-[#F5F3EE] sm:text-[36px]">
            {registration.firstName}, you&rsquo;re in.
          </h1>
          <p className="mt-3.5 text-base leading-[1.7] text-[#B8B2A9]">
            Your seat is held. A confirmation is on its way to {registration.email} with everything
            below.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[620px] px-6 pt-8 pb-[70px]">
        <dl className="overflow-hidden rounded-xl border border-[#E6E9EE] shadow-[0_1px_2px_rgba(15,23,42,.05)]">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-1 items-start gap-x-3.5 gap-y-1 border-b border-[#F3F5F8] px-[18px] py-3.5 last:border-b-0 sm:grid-cols-[132px_1fr]"
            >
              <dt className="pt-[3px] text-[10px] font-bold uppercase tracking-[.14em] text-[#64748B]">
                {row.label}
              </dt>
              <dd
                className={`text-[14.5px] leading-[1.55] text-[#0F172A] ${row.strong ? "font-semibold" : ""}`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <a
          href="/intensive/calendar.ics"
          download="daycare-owner-intensive.ics"
          className="mt-4 flex h-[50px] w-full items-center justify-center rounded-[10px] border border-brand-ink bg-brand-ink text-sm font-semibold tracking-[.03em] text-[#F5F3EE] hover:bg-[#17171C]"
        >
          Add to calendar (.ics)
        </a>

        <div className="mt-7">
          <h2 className="mb-3.5 font-serif text-xl font-semibold text-[#0F172A]">Before we start</h2>
          <ul className="flex flex-col gap-2.5">
            {PREP_LIST.map((item) => (
              <li
                key={item}
                className="grid grid-cols-[18px_1fr] items-start gap-3 rounded-[9px] border border-[#E6E9EE] px-3.5 py-3"
              >
                <span aria-hidden="true" className="text-sm leading-normal text-brand-primary">
                  ◆
                </span>
                <span className="text-pretty text-[14.5px] leading-[1.6] text-[#334155]">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 rounded-[10px] border border-[#E6E9EE] bg-[#F6F7F9] px-[17px] py-[15px] text-[13.5px] leading-[1.65] text-[#475569]">
          {/* fromAddress, not contactEmail: this is the address the mail
              actually arrives from, so it is the one worth whitelisting. */}
          Check your spam folder if nothing arrives within 15 minutes — the confirmation comes from{" "}
          <span className="font-medium text-[#0F172A]">{INTENSIVE.fromAddress}</span>. Add it to your
          contacts so the materials and replay link reach you.
        </p>
      </div>
    </div>
  );
}
