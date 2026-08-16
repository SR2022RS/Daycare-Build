"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  kioskClockIn,
  kioskClockOut,
  kioskEndBreak,
  kioskFileIncident,
  kioskIdentify,
  kioskStartBreak,
  kioskTransferRoom,
} from "@/lib/kiosk/actions";

const IDLE_RESET_MS = 45_000;
const CONFIRM_RESET_MS = 2_500;

interface Identified {
  sessionToken: string;
  fullName: string;
  clockedIn: boolean;
  onBreak: boolean;
  rooms: { id: string; name: string }[];
}

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
  const [view, setView] = useState<"pad" | "menu" | "incident">("pad");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => {
    setPin("");
    setError(null);
    setIdentified(null);
    setView("pad");
    setConfirmation(null);
  };

  const bumpIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(reset, IDLE_RESET_MS);
  };

  useEffect(() => {
    if (view !== "pad") {
      bumpIdle();
    }
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, identified]);

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

  function runAction(fn: () => Promise<{ ok: boolean; message: string }>) {
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0D0D10] px-4 py-10 text-center">
      <div className="mb-6 flex flex-col items-center">
        <p className="text-[11px] font-semibold tracking-[.2em] text-[#8C857C] uppercase">{tenantName}</p>
        <p className="mt-1 text-[13px] text-[#F5F3EE]">{locationName}</p>
      </div>

      <div className="w-full max-w-[380px] rounded-2xl border border-[var(--brand-accent)]/20 bg-[#17171C] p-6">
        {view === "pad" && (
          <>
            <h1 className="mb-5 font-serif text-lg font-semibold text-[#F5F3EE]">Enter your PIN</h1>
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
                  onClick={() => pressDigit(d)}
                  className="h-16 rounded-xl bg-[#0D0D10] text-xl font-semibold text-[#F5F3EE] hover:bg-[var(--brand-accent)]/10 active:bg-[var(--brand-accent)]/20"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={backspace}
                className="h-16 rounded-xl bg-[#0D0D10] text-sm font-semibold text-[#8C857C] hover:bg-[var(--brand-accent)]/10"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => pressDigit("0")}
                className="h-16 rounded-xl bg-[#0D0D10] text-xl font-semibold text-[#F5F3EE] hover:bg-[var(--brand-accent)]/10 active:bg-[var(--brand-accent)]/20"
              >
                0
              </button>
              <button
                type="button"
                onClick={submitPin}
                disabled={pending}
                className="h-16 rounded-xl bg-[var(--brand-accent)] text-sm font-bold tracking-[.08em] text-[#06323A] uppercase hover:opacity-90 disabled:opacity-50"
              >
                Go
              </button>
            </div>
          </>
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
          />
        )}

        {view === "incident" && identified && (
          <IncidentView
            pending={pending}
            confirmation={confirmation}
            onCancel={() => setView("menu")}
            onSubmit={(childName, whatHappened, actionTaken) =>
              runAction(() => kioskFileIncident(identified.sessionToken, whatHappened, actionTaken, childName))
            }
          />
        )}
      </div>

      <p className="mt-6 text-[11px] text-[#5A554F]">Resets automatically after a short idle period.</p>
    </div>
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
}: {
  identified: Identified;
  confirmation: string | null;
  pending: boolean;
  onCancel: () => void;
  onClockToggle: () => void;
  onBreakToggle: () => void;
  onTransfer: (roomId: string) => void;
  onIncident: () => void;
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
