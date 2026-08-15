/**
 * THE DAYCARE OWNER INTENSIVE -- single source of truth.
 *
 * Everything the funnel renders (date, price, agenda, FAQ, contact details)
 * comes from this file. Changing the date or the price is a one-line edit
 * here; no page, component or email template hardcodes any of it.
 *
 * Safe to import from both server and client components -- it is plain data
 * with no secrets. The Stripe *price id* lives here because it is a public
 * identifier; the secret key never does (see actions.ts).
 */

export const INTENSIVE = {
  name: "The Daycare Owner Intensive",
  tagline: "My journey. My system. Your blueprint.",

  /**
   * Which tenant owns this funnel. The public pages have no session to infer
   * it from, so the checkout stamps it into Stripe session metadata and the
   * webhook reads it back when writing the registration row. AKPA's own
   * tenant, seeded in supabase/seed.sql.
   */
  tenantId: "00000000-0000-0000-0000-000000000001",

  host: {
    name: "Shikara Smith",
    title: "CEO, Amazin Kids Paradise Academy",
    /**
     * Path under /public, or null to fall back to the branded monogram
     * frame rather than a broken image.
     *
     * Rendered at its own aspect ratio (1200x906), not cropped to a
     * portrait. If you replace it, change the filename too: both Next's
     * image optimizer and Vercel's CDN cache by URL, so reusing the name
     * serves the old picture long after the file has changed.
     */
    photo: "/intensive/shikara-host.jpg" as string | null,
  },

  price: 300,
  currency: "USD",

  // The Stripe price id deliberately does NOT live here. It differs between
  // test and live mode, so it belongs in the environment alongside the key it
  // must match: STRIPE_PRICE_ID, read server-side in lib/intensive/actions.ts.
  // A test price id shipped in a live deploy fails at checkout, which is
  // exactly the mistake a hardcoded value invites.

  /** Sept 13 2026, month is 0-indexed to match Date.UTC. */
  date: { year: 2026, month: 8, day: 13 },
  dateLabel: "Sunday, September 13, 2026",
  shortDate: "Sun, Sep 13 · 12:00–5:00 PM ET",
  startHour: 12,
  endHour: 17,
  doorsOpen: "11:30 AM",

  /** Eastern Daylight Time on Sept 13 2026. */
  timezoneLabel: "ET",
  timezoneOffsetUTC: -4,

  format: "in-person" as "zoom" | "in-person",
  venue: {
    name: "Republic 23 Lounge",
    address: "87 S Washington Ave, Bergenfield, NJ 07621",
  },
  /** Filled once the meeting is scheduled; until then /confirmed says so. */
  zoom: { link: "", dialIn: "" },

  replay: { included: true, days: 7 },

  /**
   * Supplied by Shikara. While this is empty the FAQ renders an "awaiting
   * Shikara, do not publish" notice instead of inventing terms; now that it
   * is set, the real answer renders and that notice is gone.
   */
  refundPolicy:
    "All sales are final. Your seat is reserved the moment you pay, so there are no refunds and no transfers. If you cannot make it on the day, you still keep the materials packet and the replay.",

  senderEmail: "amazinkidsparadiseacademy@yahoo.com",
  phone: "973-523-5318",

  /** null = no seat cap, no scarcity counter. */
  capacity: null as number | null,
} as const;

/**
 * Hosts that exist to sell the intensive rather than to run the daycare.
 * The portal and the funnel are one deployment, so the same app answers on
 * all of them; these just land on /intensive instead of the staff portal.
 *
 * Also the allowlist for Stripe return URLs: a buyer must come back to the
 * domain they started on, and the Host header is attacker-controlled, so it
 * is only trusted when it appears here.
 */
export const FUNNEL_HOSTS = [
  "akpadaycareblueprint.com",
  "www.akpadaycareblueprint.com",
  "intensive.amazinkidsparadiseacademy.com",
  // Works while DNS propagates, and gives us a stable host for exercising
  // the funnel without touching a live domain.
  "daycareownerintensive.vercel.app",
];

export interface AgendaBlock {
  time: string;
  title: string;
  detail: string;
  /** Breaks and the pre-session room -- rendered muted, not as content. */
  soft?: boolean;
}

export const AGENDA: AgendaBlock[] = [
  {
    time: "11:30 AM",
    title: "Doors open",
    detail: "Come early, find your seat and say hello. We start on time at noon.",
    soft: true,
  },
  {
    time: "12:00 – 1:00",
    title: "Licensing and regulations",
    detail:
      "Which agency governs you, the application sequence in order, ratios, and what inspectors actually look for on the day.",
  },
  {
    time: "1:00 – 2:00",
    title: "Location and startup budget",
    detail:
      "How to evaluate a space before you sign anything, real cost ranges, and what has to be funded first versus what can wait.",
  },
  {
    time: "2:00 – 3:00",
    title: "Filling seats before you open",
    detail:
      "Enrollment strategy, building a waitlist ahead of licensure, and what parents are actually deciding on when they tour.",
  },
  {
    time: "3:00 – 3:15",
    title: "Break",
    detail: "Step away, eat something, stretch. We pick straight back up at 3:15.",
    soft: true,
  },
  {
    time: "3:15 – 4:15",
    title: "Staffing and credentialing",
    detail:
      "Where to find people, the credentials they need on file, and the real reasons teachers leave in the first six weeks.",
  },
  {
    time: "4:15 – 5:00",
    title: "Running it profitably + live Q&A",
    detail:
      "Tuition structure, billing that gets paid on time, and the systems that keep the business from eating your life.",
  },
];

export const DELIVERABLES = [
  {
    title: "A licensing checklist for your state",
    detail: "The agency, the sequence, the forms — written down in the order you actually do them.",
  },
  {
    title: "A startup budget worksheet",
    detail: "Real line items with real ranges, split into must-fund-now and can-wait.",
  },
  {
    title: "An enrollment script",
    detail: "What to say on the tour and on the phone, from the first call to the signed contract.",
  },
  {
    title: "A staffing plan template",
    detail: "Roles, credentials required on file, and a hiring sequence that survives your first year.",
  },
  {
    title: "Your materials packet",
    detail: "Handed to you on the day, yours to keep. Nothing is gatekept for an upsell.",
  },
  {
    title: "The room",
    detail: "Five hours in a room with owners solving the exact problem you are solving.",
  },
];

export const CREDIBILITY = [
  { value: "4", label: "Centers owned" },
  { value: "17", label: "Years operating" },
  { value: "1,000+", label: "Families served" },
  { value: "22", label: "Owners coached" },
];

export const FOR_YOU = [
  "You want to open a daycare or childcare center and you are serious about a date, not a daydream.",
  "You opened already and enrollment, staffing or the money is not working yet.",
  "You will do the work between now and opening — this gives you the order to do it in.",
  "You would rather be told the truth about costs than be sold a fantasy.",
];

export const NOT_FOR_YOU = [
  "You are looking for passive income. Childcare is a staffed, licensed, regulated business.",
  "You want it done for you. This is a working session — you leave with your plan, not our service.",
  "You want a guaranteed number by a guaranteed date. Nobody honest can give you that.",
  "You are not willing to be licensed, inspected, and held to ratio. That part is not optional.",
];

export const PREP_LIST = [
  "Your state — or the state you plan to open in. We look up your agency live on the call.",
  "Any numbers you already have: a rent quote, a space you are considering, a budget you drafted.",
  "If you are already open: your current enrollment count and your tuition rates.",
  "Something to write with, and a way to take notes. Worksheets are handed out on the day.",
];

export interface Faq {
  question: string;
  answer: string;
  /** True while the copy is a placeholder that must not be published. */
  draft?: boolean;
}

export function buildFaqs(): Faq[] {
  const days = INTENSIVE.replay.days;

  return [
    {
      question: "Do I get a replay?",
      answer: INTENSIVE.replay.included
        ? `Yes — the recording goes out to everyone who registered and stays open for ${days} days after the session. After that it comes down.`
        : "No. This session is live only and is not recorded, so plan to attend in the room.",
    },
    {
      question: "What if I cannot make it that day?",
      answer: INTENSIVE.replay.included
        ? `Register anyway. We email you the materials packet and the replay stays open for ${days} days. You will miss the room and the live Q&A, which is a real loss at an in-person session, but the plan is still yours. Note that seats are non-refundable either way — see the refund question below.`
        : "The session is in person and live only. If you cannot be in the room that day, wait for the next date rather than paying for a seat you cannot use.",
    },
    {
      question: "Is this for people who have not started yet?",
      answer:
        "Yes — that is half the room. The first two hours are built for people with no license and no space. If you already opened, the enrollment, staffing and profitability blocks are where your five hours pay for themselves.",
    },
    {
      question: "Do you cover my state?",
      answer:
        "The sequence is the same everywhere: one lead agency, an application order, ratios, inspection. We work the framework live and you leave knowing exactly which agency and which forms are yours. Bring your state — we will find it together.",
    },
    {
      question: "What is the refund policy?",
      answer:
        INTENSIVE.refundPolicy ||
        "Awaiting Shikara — do not publish this page until these exact terms are supplied. A $300 ticket needs stated terms before it goes live.",
      draft: !INTENSIVE.refundPolicy,
    },
  ];
}

// ── Time helpers ─────────────────────────────────────────────────────────

/** Event start as a UTC epoch ms, derived from the configured ET offset. */
export function eventStartUTC(): number {
  const { date, startHour, timezoneOffsetUTC } = INTENSIVE;
  return Date.UTC(date.year, date.month, date.day, startHour - timezoneOffsetUTC, 0, 0);
}

export const isInPerson = INTENSIVE.format === "in-person";

/** "Live on Zoom" / "Republic 23 Lounge · Bergenfield, NJ" */
export const whereLabel = isInPerson
  ? `${INTENSIVE.venue.name} · Bergenfield, NJ`
  : "Live on Zoom";

/**
 * Builds an RFC 5545 calendar file for the session. Times are emitted in
 * UTC (the trailing Z) rather than as a floating local time, so the event
 * lands at noon Eastern no matter what timezone the attendee's calendar is
 * set to.
 */
export function buildIcs(): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const { date, startHour, endHour, timezoneOffsetUTC } = INTENSIVE;
  const stamp = (hour: number) =>
    `${date.year}${pad(date.month + 1)}${pad(date.day)}T${pad(hour - timezoneOffsetUTC)}0000Z`;

  const location = isInPerson
    ? `${INTENSIVE.venue.name}, ${INTENSIVE.venue.address}`
    : INTENSIVE.zoom.link || "Live on Zoom";

  // Long lines must be folded at 75 octets per the spec; these all sit well
  // under that, so a plain join is safe here.
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AKPA University//Daycare Owner Intensive//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:akpa-daycare-intensive-2026@amazinkidsparadiseacademy.com",
    `DTSTAMP:${stamp(startHour)}`,
    `DTSTART:${stamp(startHour)}`,
    `DTEND:${stamp(endHour)}`,
    `SUMMARY:${INTENSIVE.name}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${INTENSIVE.tagline} Room opens ${INTENSIVE.doorsOpen} ${INTENSIVE.timezoneLabel}. Questions: ${INTENSIVE.senderEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
