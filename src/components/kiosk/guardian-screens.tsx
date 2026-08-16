"use client";

// Guardian-facing kiosk screens, split out of kiosk-client.tsx per Task 5's
// brief: the state machine (view transitions, idle timer, session tokens)
// stays in one place in kiosk-client.tsx; this file holds only presentation
// for the two screens a parent/guardian sees. Every handler here is a prop
// passed in from kiosk-client.tsx -- this file owns no timers and calls
// bumpIdle() nowhere itself, because the parent already wires bumpIdle()
// into every one of these callbacks (see kiosk-client.tsx's onDigit,
// onBackspace, onChildAction, onCancel wiring). Keeping that wiring in the
// parent means there is exactly one idle timer for the whole kiosk, not a
// second one hiding in here that could drift out of sync.

export function ModeView({
  onStaff,
  onGuardian,
}: {
  onStaff: () => void;
  onGuardian: () => void;
}) {
  return (
    <>
      <h1 className="mb-5 font-serif text-lg font-semibold text-[#F5F3EE]">Welcome</h1>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onGuardian}
          className="h-16 rounded-xl bg-[var(--brand-accent)] text-sm font-bold tracking-[.08em] text-[#06323A] uppercase hover:opacity-90 disabled:opacity-50"
        >
          I&apos;m dropping off or picking up
        </button>
        <button
          type="button"
          onClick={onStaff}
          className="h-16 rounded-xl border border-[var(--brand-accent)]/30 text-sm font-bold tracking-[.08em] text-[#F5F3EE] uppercase hover:bg-[var(--brand-accent)]/10"
        >
          I&apos;m staff
        </button>
      </div>
    </>
  );
}

export interface GuardianChild {
  id: string;
  fullName: string;
  roomName: string | null;
  present: boolean;
}

export function GuardianMenuView({
  guardianName,
  children,
  confirmation,
  pending,
  onCancel,
  onChildAction,
}: {
  guardianName: string;
  children: GuardianChild[];
  confirmation: string | null;
  pending: boolean;
  onCancel: () => void;
  onChildAction: (child: GuardianChild) => void;
}) {
  if (confirmation) {
    return (
      <div className="py-8">
        <p className="font-serif text-lg font-semibold text-[#F5F3EE]">{confirmation}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="mb-1 font-serif text-lg font-semibold text-[#F5F3EE]">
        Hi, {guardianName.split(" ")[0]}
      </h1>

      {children.length === 0 && (
        <p className="mb-4 text-sm text-red-400">
          No children are linked to your account at this location. Contact your director.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {children.map((child) => (
          <button
            key={child.id}
            type="button"
            onClick={() => onChildAction(child)}
            disabled={pending}
            className={`flex h-16 items-center justify-between rounded-xl px-4 text-left disabled:opacity-50 ${
              child.present
                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "bg-[var(--brand-accent)] text-[#06323A] hover:opacity-90"
            }`}
          >
            <span className="flex flex-col">
              <span className="text-sm font-bold">{child.fullName}</span>
              <span className="text-[11px] font-semibold tracking-[.06em] uppercase opacity-80">
                {child.present ? `Here${child.roomName ? ` — ${child.roomName}` : ""}` : "Not checked in"}
              </span>
            </span>
            <span className="text-xs font-bold tracking-[.08em] uppercase">
              {child.present ? "Check out" : "Check in"}
            </span>
          </button>
        ))}
      </div>

      <button type="button" onClick={onCancel} className="mt-1 text-xs text-[#8C857C] hover:text-[#F5F3EE]">
        Done
      </button>
    </div>
  );
}
