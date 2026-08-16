"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  kioskCheckChildIn,
  kioskCheckChildOut,
  kioskClockIn,
  kioskClockOut,
  kioskEndBreak,
  kioskFileIncident,
  kioskIdentify,
  kioskIdentifyGuardian,
  kioskStaffCheckChild,
  kioskStaffRoster,
  kioskStartBreak,
  kioskTransferRoom,
} from "@/lib/kiosk/actions";
import type { KioskActionResult, StaffRosterResult } from "@/lib/kiosk/definitions";
import { GuardianMenuView, ModeView, type GuardianChild } from "@/components/kiosk/guardian-screens";

const IDLE_RESET_MS = 45_000;
const CONFIRM_RESET_MS = 2_500;

type View = "mode" | "pad" | "menu" | "incident" | "guardianPad" | "guardianMenu" | "staffRoster";

// Screens with nothing identifying on them -- no staff name, no guardian
// name, no child name, no room roster. The auto-arm effect below skips
// these (mirrors the original code's "view !== 'pad'" exclusion). Every
// digit press on these screens still calls bumpIdle() directly (see
// pressDigit/backspace), so a half-entered PIN still clears after
// IDLE_RESET_MS; there's just nothing sensitive to hide the instant one of
// these screens first renders, before any keypress.
const NEUTRAL_VIEWS = new Set<View>(["mode", "pad", "guardianPad"]);

interface Identified {
  sessionToken: string;
  fullName: string;
  clockedIn: boolean;
  onBreak: boolean;
  rooms: { id: string; name: string }[];
}

interface GuardianSession {
  sessionToken: string;
  guardianName: string;
  children: GuardianChild[];
}

type Roster = Extract<StaffRosterResult, { ok: true }>;
type RosterChild = Roster["rooms"][number]["children"][number];

export function KioskClient({
  deviceToken,
  locationName,
  tenantName,
}: {
  deviceToken: string;
  locationName: string;
  tenantName: string;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [identified, setIdentified] = useState<Identified | null>(null);
  const [guardian, setGuardian] = useState<GuardianSession | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [view, setView] = useState<View>("mode");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The single reset for every screen: back to the neutral mode picker,
  // with both the staff session (identified) and the guardian session
  // (guardian) torn down, plus whatever roster/PIN state was showing. This
  // is what makes the idle timer a real privacy control rather than a
  // cosmetic one -- there is exactly one path back to "nothing on screen",
  // and every new screen added in this task (guardianPad, guardianMenu,
  // staffRoster) routes through it the same way "pad"/"menu"/"incident"
  // already did.
  const reset = () => {
    setPin("");
    setError(null);
    setIdentified(null);
    setGuardian(null);
    setRoster(null);
    setRosterError(null);
    setView("mode");
    setConfirmation(null);
  };

  const bumpIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(reset, IDLE_RESET_MS);
  };

  useEffect(() => {
    if (!NEUTRAL_VIEWS.has(view)) {
      bumpIdle();
    }
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, identified, guardian]);

  function pressDigit(d: string) {
    setError(null);
    if (pin.length >= 6) return;
    bumpIdle();
    setPin((p) => p + d);
  }

  function backspace() {
    bumpIdle();
    setPin((p) => p.slice(0, -1));
  }

  function submitPin() {
    if (pin.length < 4) {
      setError("Enter your PIN.");
      return;
    }

    if (view === "guardianPad") {
      startTransition(async () => {
        const result = await kioskIdentifyGuardian(deviceToken, pin);
        if (!result.ok) {
          setError(result.message);
          setPin("");
          return;
        }
        setGuardian({
          sessionToken: result.sessionToken,
          guardianName: result.guardianName,
          children: result.children,
        });
        setPin("");
        setError(null);
        setView("guardianMenu");
      });
      return;
    }

    startTransition(async () => {
      const result = await kioskIdentify(deviceToken, pin);
      if (!result.ok) {
        setError(result.message);
        setPin("");
        return;
      }
      setIdentified({
        sessionToken: result.sessionToken,
        fullName: result.fullName,
        clockedIn: result.clockedIn,
        onBreak: result.onBreak,
        rooms: result.rooms,
      });
      setPin("");
      setError(null);
      setView("menu");
    });
  }

  function runAction(fn: () => Promise<KioskActionResult>) {
    bumpIdle();
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setConfirmation(result.message);
        setTimeout(() => setConfirmation(null), CONFIRM_RESET_MS);
        return;
      }
      setConfirmation(result.message);
      setTimeout(reset, CONFIRM_RESET_MS);
    });
  }

  // Same shape as runAction, but for the two child-check actions. It
  // overrides the server's generic "Checked in."/"Checked out." with a
  // message naming the child -- the person reading this is usually a parent
  // at 8am with a bag in one hand, and "Sofia is checked in" is legible at a
  // glance in a way "Success" is not. Failure messages from the server are
  // shown verbatim (e.g. "That child isn't linked to your account."), since
  // those are already specific and actionable.
  function runChildAction(childName: string, direction: "in" | "out", fn: () => Promise<KioskActionResult>) {
    bumpIdle();
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setConfirmation(result.message);
        setTimeout(() => setConfirmation(null), CONFIRM_RESET_MS);
        return;
      }
      const verb = direction === "in" ? "checked in" : "checked out";
      setConfirmation(`${childName} is ${verb}.`);
      setTimeout(reset, CONFIRM_RESET_MS);
    });
  }

  function openRoster() {
    if (!identified) return;
    bumpIdle();
    setView("staffRoster");
    setRoster(null);
    setRosterError(null);
    startTransition(async () => {
      const result = await kioskStaffRoster(identified.sessionToken);
      if (!result.ok) {
        setRosterError(result.message);
        return;
      }
      setRoster(result);
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0D0D10] px-4 py-10 text-center">
      <div className="mb-6 flex flex-col items-center">
        <p className="text-[11px] font-semibold tracking-[.2em] text-[#8C857C] uppercase">{tenantName}</p>
        <p className="mt-1 text-[13px] text-[#F5F3EE]">{locationName}</p>
      </div>

      <div className="w-full max-w-[380px] rounded-2xl border border-[var(--brand-accent)]/20 bg-[#17171C] p-6">
        {view === "mode" && (
          <ModeView
            onStaff={() => {
              bumpIdle();
              setView("pad");
            }}
            onGuardian={() => {
              bumpIdle();
              setView("guardianPad");
            }}
          />
        )}

        {(view === "pad" || view === "guardianPad") && (
          <PinPad
            heading={view === "guardianPad" ? "Enter your family PIN" : "Enter your PIN"}
            pin={pin}
            error={error}
            pending={pending}
            onDigit={pressDigit}
            onBackspace={backspace}
            onSubmit={submitPin}
          />
        )}

        {view === "menu" && identified && (
          <MenuView
            identified={identified}
            confirmation={confirmation}
            pending={pending}
            onCancel={reset}
            onClockToggle={() =>
              runAction(() =>
                identified.clockedIn ? kioskClockOut(identified.sessionToken) : kioskClockIn(identified.sessionToken),
              )
            }
            onBreakToggle={() =>
              runAction(() =>
                identified.onBreak ? kioskEndBreak(identified.sessionToken) : kioskStartBreak(identified.sessionToken),
              )
            }
            onTransfer={(roomId) => runAction(() => kioskTransferRoom(identified.sessionToken, roomId))}
            onIncident={() => {
              bumpIdle();
              setView("incident");
            }}
            onRoster={openRoster}
          />
        )}

        {view === "incident" && identified && (
          <IncidentView
            pending={pending}
            confirmation={confirmation}
            onCancel={() => {
              bumpIdle();
              setView("menu");
            }}
            onSubmit={(childName, whatHappened, actionTaken) =>
              runAction(() => kioskFileIncident(identified.sessionToken, whatHappened, actionTaken, childName))
            }
          />
        )}

        {view === "guardianMenu" && guardian && (
          <GuardianMenuView
            guardianName={guardian.guardianName}
            children={guardian.children}
            confirmation={confirmation}
            pending={pending}
            onCancel={reset}
            onChildAction={(child) =>
              runChildAction(child.fullName, child.present ? "out" : "in", () =>
                child.present
                  ? kioskCheckChildOut(guardian.sessionToken, child.id)
                  : kioskCheckChildIn(guardian.sessionToken, child.id),
              )
            }
          />
        )}

        {view === "staffRoster" && identified && (
          <StaffRosterView
            roster={roster}
            rosterError={rosterError}
            loading={pending && !roster && !rosterError}
            confirmation={confirmation}
            pending={pending}
            onBack={() => {
              bumpIdle();
              setView("menu");
            }}
            onChildAction={(child, direction) =>
              runChildAction(child.fullName, direction, () =>
                kioskStaffCheckChild(identified.sessionToken, child.id, direction),
              )
            }
          />
        )}
      </div>

      <p className="mt-6 text-[11px] text-[#5A554F]">Resets automatically after a short idle period.</p>
    </div>
  );
}

// The staff PIN pad and the guardian PIN pad are the same markup (per
// Task 5's brief: "reuse the existing keypad markup verbatim"). Parameterized
// on heading + handlers rather than copy-pasted twice, so the two can't
// silently drift apart -- but every class name below is unchanged from the
// original inline "pad" block.
function PinPad({
  heading,
  pin,
  error,
  pending,
  onDigit,
  onBackspace,
  onSubmit,
}: {
  heading: string;
  pin: string;
  error: string | null;
  pending: boolean;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="mb-5 font-serif text-lg font-semibold text-[#F5F3EE]">{heading}</h1>
      <div className="mb-5 flex justify-center gap-3">
        {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${
              i < pin.length ? "bg-[var(--brand-accent)]" : "border border-[var(--brand-accent)]/30"
            }`}
          />
        ))}
      </div>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onDigit(d)}
            className="h-16 rounded-xl bg-[#0D0D10] text-xl font-semibold text-[#F5F3EE] hover:bg-[var(--brand-accent)]/10 active:bg-[var(--brand-accent)]/20"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={onBackspace}
          className="h-16 rounded-xl bg-[#0D0D10] text-sm font-semibold text-[#8C857C] hover:bg-[var(--brand-accent)]/10"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onDigit("0")}
          className="h-16 rounded-xl bg-[#0D0D10] text-xl font-semibold text-[#F5F3EE] hover:bg-[var(--brand-accent)]/10 active:bg-[var(--brand-accent)]/20"
        >
          0
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="h-16 rounded-xl bg-[var(--brand-accent)] text-sm font-bold tracking-[.08em] text-[#06323A] uppercase hover:opacity-90 disabled:opacity-50"
        >
          Go
        </button>
      </div>
    </>
  );
}

function MenuView({
  identified,
  confirmation,
  pending,
  onCancel,
  onClockToggle,
  onBreakToggle,
  onTransfer,
  onIncident,
  onRoster,
}: {
  identified: Identified;
  confirmation: string | null;
  pending: boolean;
  onCancel: () => void;
  onClockToggle: () => void;
  onBreakToggle: () => void;
  onTransfer: (roomId: string) => void;
  onIncident: () => void;
  onRoster: () => void;
}) {
  const [roomId, setRoomId] = useState("");

  if (confirmation) {
    return (
      <div className="py-8">
        <p className="font-serif text-lg font-semibold text-[#F5F3EE]">{confirmation}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="mb-1 font-serif text-lg font-semibold text-[#F5F3EE]">Hi, {identified.fullName.split(" ")[0]}</h1>

      <button
        type="button"
        onClick={onClockToggle}
        disabled={pending}
        className={`h-16 rounded-xl text-sm font-bold tracking-[.08em] uppercase disabled:opacity-50 ${
          identified.clockedIn
            ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
            : "bg-[var(--brand-accent)] text-[#06323A] hover:opacity-90"
        }`}
      >
        {identified.clockedIn ? "Clock out" : "Clock in"}
      </button>

      <button
        type="button"
        onClick={onBreakToggle}
        disabled={pending || !identified.clockedIn}
        className="h-12 rounded-xl border border-[var(--brand-accent)]/30 text-xs font-semibold tracking-[.08em] text-[#F5F3EE] uppercase hover:bg-[var(--brand-accent)]/10 disabled:opacity-40"
      >
        {identified.onBreak ? "End break" : "Start break"}
      </button>

      {identified.rooms.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="h-11 flex-1 rounded-lg border border-[var(--brand-accent)]/30 bg-[#0D0D10] px-2 text-sm text-[#F5F3EE] outline-none"
          >
            <option value="">Transfer to room…</option>
            {identified.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !roomId}
            onClick={() => onTransfer(roomId)}
            className="h-11 rounded-lg border border-[var(--brand-accent)]/30 px-3 text-xs font-semibold text-[#F5F3EE] hover:bg-[var(--brand-accent)]/10 disabled:opacity-40"
          >
            Move
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onRoster}
        className="h-12 rounded-xl border border-[var(--brand-accent)]/30 text-xs font-semibold tracking-[.08em] text-[#F5F3EE] uppercase hover:bg-[var(--brand-accent)]/10"
      >
        Check children in/out
      </button>

      <button
        type="button"
        onClick={onIncident}
        className="h-12 rounded-xl border border-red-500/30 text-xs font-semibold tracking-[.08em] text-red-300 uppercase hover:bg-red-500/10"
      >
        Report an incident
      </button>

      <button type="button" onClick={onCancel} className="mt-1 text-xs text-[#8C857C] hover:text-[#F5F3EE]">
        Done
      </button>
    </div>
  );
}

function IncidentView({
  pending,
  confirmation,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  confirmation: string | null;
  onCancel: () => void;
  onSubmit: (childName: string, whatHappened: string, actionTaken: string) => void;
}) {
  const [childName, setChildName] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [actionTaken, setActionTaken] = useState("");

  if (confirmation) {
    return (
      <div className="py-8">
        <p className="font-serif text-lg font-semibold text-[#F5F3EE]">{confirmation}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 text-left">
      <h1 className="mb-1 text-center font-serif text-lg font-semibold text-[#F5F3EE]">Report an incident</h1>
      <label className="text-[10.5px] font-semibold tracking-[.14em] text-[#8C857C] uppercase">
        Child (optional)
        <input
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-[var(--brand-accent)]/20 bg-[#0D0D10] px-3 text-sm text-[#F5F3EE] outline-none focus:border-[var(--brand-accent)]"
        />
      </label>
      <label className="text-[10.5px] font-semibold tracking-[.14em] text-[#8C857C] uppercase">
        What happened
        <textarea
          value={whatHappened}
          onChange={(e) => setWhatHappened(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-[var(--brand-accent)]/20 bg-[#0D0D10] px-3 py-2 text-sm text-[#F5F3EE] outline-none focus:border-[var(--brand-accent)]"
        />
      </label>
      <label className="text-[10.5px] font-semibold tracking-[.14em] text-[#8C857C] uppercase">
        Action taken
        <textarea
          value={actionTaken}
          onChange={(e) => setActionTaken(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-[var(--brand-accent)]/20 bg-[#0D0D10] px-3 py-2 text-sm text-[#F5F3EE] outline-none focus:border-[var(--brand-accent)]"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() => onSubmit(childName, whatHappened, actionTaken)}
        className="mt-1 h-12 rounded-xl bg-[var(--brand-accent)] text-sm font-bold tracking-[.08em] text-[#06323A] uppercase hover:opacity-90 disabled:opacity-50"
      >
        Submit
      </button>
      <button type="button" onClick={onCancel} className="text-center text-xs text-[#8C857C] hover:text-[#F5F3EE]">
        Back
      </button>
    </div>
  );
}

// Staff roster screen: every active child at this kiosk's own location,
// grouped by room, each with an in/out control. Reached only from the staff
// menu (view === "staffRoster" is gated on `identified` in the parent), so
// this data -- child names -- is never rendered before a staff PIN has
// authenticated, same as the guardian screens are never rendered before a
// guardian PIN has authenticated.
function StaffRosterView({
  roster,
  rosterError,
  loading,
  confirmation,
  pending,
  onBack,
  onChildAction,
}: {
  roster: Roster | null;
  rosterError: string | null;
  loading: boolean;
  confirmation: string | null;
  pending: boolean;
  onBack: () => void;
  onChildAction: (child: RosterChild, direction: "in" | "out") => void;
}) {
  if (confirmation) {
    return (
      <div className="py-8">
        <p className="font-serif text-lg font-semibold text-[#F5F3EE]">{confirmation}</p>
      </div>
    );
  }

  const isEmpty = roster && roster.rooms.length === 0 && roster.unassigned.length === 0;

  return (
    <div className="flex flex-col gap-3 text-left">
      <h1 className="mb-1 text-center font-serif text-lg font-semibold text-[#F5F3EE]">Check children in/out</h1>

      {loading && <p className="text-center text-sm text-[#8C857C]">Loading roster…</p>}
      {rosterError && <p className="mb-4 text-sm text-red-400">{rosterError}</p>}
      {isEmpty && <p className="mb-4 text-sm text-red-400">No children are enrolled at this location.</p>}

      {roster && !isEmpty && (
        <div className="flex max-h-[52vh] flex-col gap-4 overflow-y-auto pr-1">
          {roster.rooms.map((room) => (
            <div key={room.id}>
              <p className="mb-1.5 text-[10.5px] font-semibold tracking-[.14em] text-[#8C857C] uppercase">
                {room.name}
              </p>
              <div className="flex flex-col gap-1.5">
                {room.children.map((child) => (
                  <RosterRow key={child.id} child={child} pending={pending} onAction={onChildAction} />
                ))}
              </div>
            </div>
          ))}
          {roster.unassigned.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10.5px] font-semibold tracking-[.14em] text-[#8C857C] uppercase">
                No room assigned
              </p>
              <div className="flex flex-col gap-1.5">
                {roster.unassigned.map((child) => (
                  <RosterRow key={child.id} child={child} pending={pending} onAction={onChildAction} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={onBack} className="mt-1 text-center text-xs text-[#8C857C] hover:text-[#F5F3EE]">
        Back
      </button>
    </div>
  );
}

function RosterRow({
  child,
  pending,
  onAction,
}: {
  child: RosterChild;
  pending: boolean;
  onAction: (child: RosterChild, direction: "in" | "out") => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[#0D0D10] px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${child.present ? "bg-emerald-400" : "bg-[#5A554F]"}`} />
        <span className="text-sm text-[#F5F3EE]">{child.fullName}</span>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => onAction(child, child.present ? "out" : "in")}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold tracking-[.08em] uppercase disabled:opacity-40 ${
          child.present
            ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
            : "bg-[var(--brand-accent)] text-[#06323A] hover:opacity-90"
        }`}
      >
        {child.present ? "Check out" : "Check in"}
      </button>
    </div>
  );
}
