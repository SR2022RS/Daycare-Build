import type { Metadata } from "next";
import Image from "next/image";

import {
  AGENDA,
  CREDIBILITY,
  DELIVERABLES,
  FOR_YOU,
  INTENSIVE,
  NOT_FOR_YOU,
  buildFaqs,
  isInPerson,
  whereLabel,
} from "@/lib/intensive/config";
import { CtaButton } from "@/components/intensive/cta-button";
import { CountdownBar, HeroCountdown } from "@/components/intensive/countdown";
import { FaqList } from "@/components/intensive/faq-list";
import { StickyCta } from "@/components/intensive/sticky-cta";

const DESCRIPTION =
  "A live five-hour working session for people opening a childcare center — and newer owners trying to make one profitable. Leave with a licensing path, a startup budget, an enrollment plan and a staffing model.";

export const metadata: Metadata = {
  title: `${INTENSIVE.name} — ${INTENSIVE.dateLabel}`,
  description: DESCRIPTION,
  openGraph: {
    title: INTENSIVE.name,
    description: DESCRIPTION,
    type: "website",
  },
  twitter: { card: "summary_large_image", title: INTENSIVE.name, description: DESCRIPTION },
};

const HERO_BACKGROUND =
  "radial-gradient(1px 1px at 16% 20%, rgba(227,12,123,.6), transparent 60%)," +
  "radial-gradient(1px 1px at 68% 12%, rgba(255,255,255,.3), transparent 60%)," +
  "radial-gradient(1.5px 1.5px at 40% 70%, rgba(227,12,123,.4), transparent 60%)," +
  "radial-gradient(1px 1px at 84% 56%, rgba(255,255,255,.2), transparent 60%)," +
  "radial-gradient(1px 1px at 24% 88%, rgba(227,12,123,.3), transparent 60%)," +
  "radial-gradient(130% 95% at 8% 0%, rgba(227,12,123,.34) 0%, rgba(10,10,13,0) 64%)," +
  "#0A0A0D";

const eyebrow = `${INTENSIVE.dateLabel} · 12:00–5:00 PM ${INTENSIVE.timezoneLabel} · ${
  isInPerson ? "Bergenfield, NJ" : "Live on Zoom"
}`;

const replayLine = INTENSIVE.replay.included ? ` · Replay for ${INTENSIVE.replay.days} days` : "";
const ctaFinePrint = `${INTENSIVE.dateLabel} · ${whereLabel}${replayLine}`;
const stickySubtitle = `${INTENSIVE.shortDate} · $${INTENSIVE.price}`;

export default function IntensiveLandingPage() {
  const faqs = buildFaqs();

  return (
    <div className="bg-brand-ink">
      <CountdownBar subtitle={stickySubtitle} />

      <header
        className="relative overflow-hidden px-6 pt-11 pb-13"
        style={{ background: HERO_BACKGROUND }}
      >
        <div className="mx-auto max-w-[720px]">
          <div className="mb-9 flex items-center gap-3.5">
            {/* The logo art is already a transparent cutout with its own
                light outline, so it sits directly on the dark hero -- no
                white plate behind it. */}
            <Image
              src="/logo/akpa-logo.png"
              alt="Amazin Kids Paradise Academy"
              width={316}
              height={136}
              priority
              className="h-auto w-[158px]"
            />
            <div className="border-l border-[rgba(227,12,123,.3)] pl-3.5 leading-tight">
              <p className="font-serif text-xs font-semibold tracking-[.16em] text-[#FF4FA3]">
                AKPA UNIVERSITY
              </p>
              <p className="mt-[3px] text-[9.5px] uppercase tracking-[.2em] text-[#8C857C]">
                Educate. Empower. Elevate.
              </p>
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase leading-[1.7] tracking-[.22em] text-[#FF4FA3]">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-pretty font-serif text-[34px] font-semibold leading-[1.15] tracking-[-.005em] text-[#F5F3EE] sm:text-[40px]">
            Stop researching how to open a daycare. Spend five hours actually planning yours.
          </h1>
          <div className="my-[26px] h-px w-[110px] bg-gradient-to-r from-brand-primary to-transparent" />
          <p className="max-w-[560px] text-pretty text-[16.5px] leading-[1.68] text-[#B8B2A9]">
            A live working session for people opening a childcare center — and newer owners trying
            to make one profitable. You leave with a licensing path, a startup budget, an enrollment
            plan and a staffing model. Not another folder of bookmarked articles.
          </p>

          <div className="mt-8">
            <CtaButton className="max-w-[420px]">Reserve My Seat — ${INTENSIVE.price}</CtaButton>
            <p className="mt-3 text-[13px] leading-[1.7] text-[#8C857C]">{ctaFinePrint}</p>
          </div>

          <HeroCountdown />
        </div>
      </header>

      <section className="bg-white px-6 py-[62px]">
        <div className="mx-auto max-w-[640px]">
          <p className="text-[10.5px] font-bold uppercase tracking-[.22em] text-brand-primary">
            The last six months
          </p>
          <h2 className="mt-3.5 mb-[22px] text-pretty font-serif text-[26px] font-semibold leading-tight text-[#0F172A] sm:text-[28px]">
            You are not short on information. You are short on sequence.
          </h2>
          <div className="flex flex-col gap-[18px] text-base leading-[1.72] text-[#334155]">
            <p className="text-pretty">
              You have the tabs open. Licensing requirements from a state PDF written in 2019, a
              YouTube video about ratios, three Facebook groups where everyone gives a different
              answer. You still do not know which agency to call first, or what they will ask when
              you do.
            </p>
            <p className="text-pretty">
              You have a number in your head for what this costs to open. You are not confident in
              it. You do not know what has to be funded before you can be licensed, and what can
              honestly wait until month four — so the whole thing sits, because the wrong guess is
              expensive.
            </p>
            <p className="text-pretty">
              Or you already opened. You have a beautiful room, a license on the wall, and three
              children enrolled. Nobody told you that filling seats starts months before the doors
              do, and now every week of low enrollment is coming out of your own account.
            </p>
            <p className="text-pretty">
              And you have hired. Twice. Both of them were gone inside six weeks, and you are back
              to opening, closing, covering the infant room and doing payroll at 11 PM.
            </p>
          </div>
          <p className="mt-6 border-l-[3px] border-brand-primary pl-[18px] text-pretty text-[16.5px] font-medium leading-[1.6] text-[#0F172A]">
            None of that is a research problem. It is an order-of-operations problem — and it is
            fixable in an afternoon with someone who has already done it three times.
          </p>
        </div>
      </section>

      <section className="border-y border-[#E6E9EE] bg-[#F6F7F9] px-6 py-[58px]">
        <div className="mx-auto max-w-[720px]">
          <p className="text-[10.5px] font-bold uppercase tracking-[.22em] text-[#55647A]">
            The five hours
          </p>
          <h2 className="mt-3.5 mb-2 font-serif text-[26px] font-semibold text-[#0F172A] sm:text-[28px]">
            What we&rsquo;ll cover
          </h2>
          <p className="mb-[26px] text-[14.5px] leading-[1.6] text-[#55647A]">
            Room opens at {INTENSIVE.doorsOpen} {INTENSIVE.timezoneLabel}. Draft running order —
            Shikara may adjust before the day.
          </p>

          <ol className="flex flex-col gap-2.5">
            {AGENDA.map((block) => (
              <li
                key={block.title}
                className="grid grid-cols-1 items-start gap-x-4 gap-y-1 rounded-[10px] border border-[#E6E9EE] bg-white px-[18px] py-4 shadow-[0_1px_2px_rgba(15,23,42,.05)] sm:grid-cols-[118px_1fr]"
                style={{ borderLeft: `3px solid ${block.soft ? "#E2E6EC" : "#E30C7B"}` }}
              >
                <span
                  className="pt-0.5 text-[12.5px] font-semibold tabular-nums"
                  style={{ color: block.soft ? "#64748B" : "#0F172A" }}
                >
                  {block.time}
                </span>
                <div className="min-w-0">
                  <h3 className="font-serif text-[15.5px] font-semibold text-[#0F172A]">
                    {block.title}
                  </h3>
                  <p className="mt-[5px] text-pretty text-sm leading-[1.6] text-[#64748B]">
                    {block.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white px-6 py-[58px]">
        <div className="mx-auto max-w-[720px]">
          <p className="text-[10.5px] font-bold uppercase tracking-[.22em] text-[#64748B]">
            Not notes — documents
          </p>
          <h2 className="mt-3.5 mb-[26px] font-serif text-[26px] font-semibold text-[#0F172A] sm:text-[28px]">
            What you walk away with
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(258px,1fr))] gap-3">
            {DELIVERABLES.map((item, index) => (
              <li
                key={item.title}
                className="rounded-[10px] border border-[#E6E9EE] bg-white px-[17px] py-4 shadow-[0_1px_2px_rgba(15,23,42,.05)]"
              >
                <span
                  aria-hidden="true"
                  className="font-serif text-xs font-bold tracking-[.1em] text-brand-primary"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-[15px] font-semibold text-[#0F172A]">{item.title}</h3>
                <p className="mt-[5px] text-pretty text-[13.5px] leading-[1.6] text-[#64748B]">
                  {item.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-brand-ink px-6 py-[58px]">
        <div className="mx-auto grid max-w-[720px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-[30px]">
          <div className="max-w-[420px]">
            {INTENSIVE.host.photo ? (
              // Rendered at the photo's own aspect ratio rather than cropped
              // to a portrait frame -- this shot is landscape, and forcing it
              // into 3:4 threw away the room it was taken in.
              <Image
                src={INTENSIVE.host.photo}
                alt={`${INTENSIVE.host.name}, ${INTENSIVE.host.title}`}
                width={1200}
                height={906}
                className="h-auto w-full rounded-xl border border-[rgba(227,12,123,.3)]"
              />
            ) : (
              // No photo on file yet -- a branded monogram frame keeps the
              // section composed instead of leaving a broken image. Drop the
              // file in and set host.photo in config.ts to swap it out.
              <div
                aria-hidden="true"
                className="flex aspect-[3/4] w-full items-center justify-center rounded-xl border border-[rgba(227,12,123,.3)] bg-[radial-gradient(120%_90%_at_20%_0%,rgba(227,12,123,.28)_0%,rgba(10,10,13,0)_62%),#101014]"
              >
                <span className="font-serif text-[52px] font-semibold tracking-[.08em] text-[rgba(245,243,238,.55)]">
                  SS
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[.22em] text-[#FF4FA3]">
              Your host
            </p>
            <h2 className="mt-3 mb-1 font-serif text-[27px] font-semibold text-[#F5F3EE]">
              {INTENSIVE.host.name}
            </h2>
            <p className="text-sm text-[#8C857C]">{INTENSIVE.host.title}</p>
            <div className="my-5 h-px w-[90px] bg-gradient-to-r from-brand-primary to-transparent" />
            <div className="flex flex-col gap-3.5 text-[15.5px] leading-[1.7] text-[#B8B2A9]">
              <p className="text-pretty">
                I started from my mama&rsquo;s house. No investor, no blueprint, no one in my family
                who had done it — just a license, a room, and children whose parents needed
                somewhere safe to be at 6 AM.
              </p>
              <p className="text-pretty">
                That became a multi-location childcare brand. I have made every expensive mistake
                available on the way here, and I am not going to make you pay tuition for the same
                ones. No gatekeeping. Real game, real results.
              </p>
            </div>
            <dl className="mt-7 flex flex-wrap gap-8 border-t border-[rgba(227,12,123,.22)] pt-6">
              {CREDIBILITY.map((stat) => (
                <div key={stat.label}>
                  <dd className="font-serif text-[30px] font-semibold leading-none text-[#F5F3EE]">
                    {stat.value}
                  </dd>
                  <dt className="mt-2 text-[10px] uppercase tracking-[.18em] text-[#8C857C]">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-[58px]">
        <div className="mx-auto grid max-w-[720px] grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          <div className="rounded-xl border border-[#E6E9EE] border-t-[3px] border-t-[#3E8E41] bg-white px-5 py-[22px] shadow-[0_1px_2px_rgba(15,23,42,.05)]">
            <h3 className="mb-1 font-serif text-lg font-semibold text-[#0F172A]">
              This is for you if
            </h3>
            <p className="mb-4 text-[12.5px] text-[#64748B]">Five hours will move you</p>
            <ul className="flex flex-col gap-3">
              {FOR_YOU.map((line) => (
                <li key={line} className="grid grid-cols-[16px_1fr] items-start gap-[11px]">
                  <span aria-hidden="true" className="text-[15px] leading-normal text-[#2F7233]">
                    ✓
                  </span>
                  <span className="text-pretty text-[14.5px] leading-[1.55] text-[#334155]">
                    {line}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-[#E6E9EE] border-t-[3px] border-t-[#B42318] bg-white px-5 py-[22px] shadow-[0_1px_2px_rgba(15,23,42,.05)]">
            <h3 className="mb-1 font-serif text-lg font-semibold text-[#0F172A]">
              This is not for you if
            </h3>
            <p className="mb-4 text-[12.5px] text-[#64748B]">Please keep your ${INTENSIVE.price}</p>
            <ul className="flex flex-col gap-3">
              {NOT_FOR_YOU.map((line) => (
                <li key={line} className="grid grid-cols-[16px_1fr] items-start gap-[11px]">
                  <span aria-hidden="true" className="text-[15px] leading-normal text-[#B42318]">
                    ✕
                  </span>
                  <span className="text-pretty text-[14.5px] leading-[1.55] text-[#334155]">
                    {line}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-[#E6E9EE] bg-[#F6F7F9] px-6 py-[58px]">
        <div className="mx-auto max-w-[640px]">
          <h2 className="mb-[22px] font-serif text-[26px] font-semibold text-[#0F172A] sm:text-[28px]">
            Questions
          </h2>
          <FaqList items={faqs} />
        </div>
      </section>

      <section className="bg-brand-ink px-6 pt-[62px] pb-[88px] text-center">
        <div className="mx-auto max-w-[560px]">
          <h2 className="text-pretty font-serif text-[28px] font-semibold leading-tight text-[#F5F3EE] sm:text-[30px]">
            This is your time. This is your move.
          </h2>
          <p className="mt-4 mb-7 text-[15.5px] leading-[1.7] text-[#8C857C]">
            {INTENSIVE.dateLabel}. 12:00–5:00 PM {INTENSIVE.timezoneLabel}. {whereLabel}. $
            {INTENSIVE.price}, one payment, materials included.
          </p>
          <div className="mx-auto max-w-[400px]">
            <CtaButton>Reserve My Seat — ${INTENSIVE.price}</CtaButton>
          </div>
          <p className="mt-[22px] text-[12.5px] leading-[1.8] text-[#8C857C]">
            <a href={`mailto:${INTENSIVE.senderEmail}`} className="hover:text-[#3CC0D8]">
              {INTENSIVE.senderEmail}
            </a>{" "}
            ·{" "}
            <a
              href={`tel:${INTENSIVE.phone.replace(/[^0-9+]/g, "")}`}
              className="hover:text-[#3CC0D8]"
            >
              {INTENSIVE.phone}
            </a>
          </p>
        </div>
      </section>

      <StickyCta subtitle={stickySubtitle} />
    </div>
  );
}
