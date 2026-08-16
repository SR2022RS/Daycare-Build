"use client";

import { useSyncExternalStore } from "react";

import { INTENSIVE, eventStartUTC } from "@/lib/intensive/config";

/**
 * A single shared 1Hz clock, modelled as an external store rather than an
 * effect that calls setState. Two things fall out of that:
 *
 *  - `getServerSnapshot` returns null, so the server-rendered HTML and the
 *    first client render agree. The server's "now" is never the browser's,
 *    so any countdown rendered directly from Date.now() is a guaranteed
 *    hydration mismatch.
 *  - Every countdown on the page shares one interval and therefore ticks on
 *    the same frame, instead of drifting a few hundred ms apart.
 *
 * The snapshot is a cached field, not a fresh Date.now() per call --
 * useSyncExternalStore requires a stable snapshot or it re-renders forever.
 */
const clock = {
  now: 0,
  listeners: new Set<() => void>(),
  timer: null as ReturnType<typeof setInterval> | null,
};

function subscribe(onStoreChange: () => void) {
  clock.now = Date.now();
  clock.listeners.add(onStoreChange);

  clock.timer ??= setInterval(() => {
    clock.now = Date.now();
    for (const listener of clock.listeners) listener();
  }, 1000);

  return () => {
    clock.listeners.delete(onStoreChange);
    if (clock.listeners.size === 0 && clock.timer) {
      clearInterval(clock.timer);
      clock.timer = null;
    }
  };
}

function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => clock.now,
    () => null,
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

interface Parts {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
}

function split(remaining: number): Parts {
  return {
    days: String(Math.floor(remaining / 86_400_000)),
    hours: pad(Math.floor(remaining / 3_600_000) % 24),
    minutes: pad(Math.floor(remaining / 60_000) % 60),
    seconds: pad(Math.floor(remaining / 1000) % 60),
  };
}

const PLACEHOLDER: Parts = { days: "—", hours: "—", minutes: "—", seconds: "—" };

/** null while the first client tick has not landed yet. */
function useCountdownState(): { parts: Parts; ended: boolean | null } {
  const now = useNow();
  // null during hydration, 0 on a client-only first render before the store
  // has been subscribed to -- neither is a real time.
  if (!now) return { parts: PLACEHOLDER, ended: null };

  const remaining = eventStartUTC() - now;
  if (remaining <= 0) return { parts: PLACEHOLDER, ended: true };
  return { parts: split(remaining), ended: false };
}

/**
 * The thin bar pinned under the page header. Renders nothing once the
 * session has started -- a countdown to a date in the past is noise.
 */
export function CountdownBar({ subtitle }: { subtitle: string }) {
  const { parts, ended } = useCountdownState();
  if (ended) return null;

  const units: { value: string; abbr: string; tone: string }[] = [
    { value: parts.days, abbr: "d", tone: "#FF4FA3" },
    { value: parts.hours, abbr: "h", tone: "#F0D818" },
    { value: parts.minutes, abbr: "m", tone: "#3CC0D8" },
    { value: parts.seconds, abbr: "s", tone: "#FC9024" },
  ];

  return (
    <div className="sticky top-0 z-40 border-b border-[rgba(227,12,123,.28)] bg-[rgba(10,10,13,.97)] backdrop-blur-md">
      <div className="flex h-[3px]">
        <span className="flex-1 bg-[#E30C7B]" />
        <span className="flex-1 bg-[#F0D818]" />
        <span className="flex-1 bg-[#3CC0D8]" />
        <span className="flex-1 bg-[#489C48]" />
        <span className="flex-1 bg-[#FC9024]" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#8C857C]">
          Live in
        </span>
        <div className="flex items-baseline gap-2.5" aria-hidden="true">
          {units.map((unit) => (
            <span key={unit.abbr} className="flex items-baseline gap-1">
              <span
                className="font-serif text-[19px] font-semibold leading-none tabular-nums"
                style={{ color: unit.tone }}
              >
                {unit.value}
              </span>
              <span className="text-[9.5px] uppercase tracking-[.12em] text-[#8C857C]">
                {unit.abbr}
              </span>
            </span>
          ))}
        </div>
        <span className="text-[11.5px] text-[#8C857C]">{subtitle}</span>
      </div>
    </div>
  );
}

/**
 * The typographic countdown inside the hero, plus the post-event state that
 * replaces it. Deliberately not a flashing red pressure widget -- capacity
 * is uncapped, so the only honest urgency here is the calendar.
 */
export function HeroCountdown() {
  const { parts, ended } = useCountdownState();

  if (ended) {
    return (
      <div className="mt-10 rounded-xl border border-[rgba(227,12,123,.28)] bg-[rgba(227,12,123,.06)] px-5 py-5">
        <p className="font-serif text-[19px] text-[#F5F3EE]">This session has ended.</p>
        <p className="mt-2 text-sm leading-relaxed text-[#8C857C]">
          The next date has not been announced yet. Reach out and Shikara will tell you before it
          goes public.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a
            href={`mailto:${INTENSIVE.contactEmail}?subject=${encodeURIComponent(
              "Next Daycare Owner Intensive date",
            )}`}
            className="font-medium text-[#FF4FA3] underline underline-offset-4 hover:text-[#3CC0D8]"
          >
            {INTENSIVE.contactEmail}
          </a>
          <a
            href={`tel:${INTENSIVE.phone.replace(/[^0-9+]/g, "")}`}
            className="font-medium text-[#FF4FA3] underline underline-offset-4 hover:text-[#3CC0D8]"
          >
            {INTENSIVE.phone}
          </a>
        </div>
      </div>
    );
  }

  const units = [
    { value: parts.days, label: "Days" },
    { value: parts.hours, label: "Hours" },
    { value: parts.minutes, label: "Minutes" },
    { value: parts.seconds, label: "Seconds" },
  ];

  return (
    <div className="mt-10 border-t border-[rgba(227,12,123,.18)] pt-6">
      <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#8C857C]">
        We go live in
      </p>
      <div className="mt-3.5 flex flex-wrap gap-8" aria-hidden="true">
        {units.map((unit) => (
          <div key={unit.label}>
            <div className="font-serif text-[38px] font-medium leading-none tabular-nums text-[#F5F3EE]">
              {unit.value}
            </div>
            <div className="mt-[7px] text-[10px] uppercase tracking-[.2em] text-[#8C857C]">
              {unit.label}
            </div>
          </div>
        ))}
      </div>
      <p className="sr-only">
        The session begins {INTENSIVE.dateLabel} at 12:00 PM {INTENSIVE.timezoneLabel}.
      </p>
    </div>
  );
}
