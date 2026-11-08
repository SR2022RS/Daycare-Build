"use client";

import { useActionState } from "react";

import { resetGuardianPin } from "@/lib/children/actions";

// `useActionState` is a client hook and the child detail page is a Server
// Component, so this control cannot live inline in that page -- same reason
// `ResetPinForm` exists separately for staff. The two are deliberately not
// merged: they call different RPCs with different authorization rules, and a
// single component parameterized on "which kind of person is this" is exactly
// the shape that eventually issues a staff PIN to a parent.
export function ResetGuardianPinForm({ guardianId, guardianName }: { guardianId: string; guardianName: string }) {
  const [state, action, pending] = useActionState(resetGuardianPin, undefined);

  return (
    <form action={action} className="mt-1.5">
      <input type="hidden" name="guardianId" value={guardianId} />
      {state?.pin ? (
        <p className="mb-1.5 rounded-md bg-green-50 px-3 py-2 text-[12.5px] text-green-800">
          Kiosk PIN for {guardianName}:{" "}
          <span className="font-mono text-base font-semibold tracking-widest">{state.pin}</span>
          <br />
          <span className="text-[11px] text-green-700">
            Shown once &mdash; write it down or hand it over now. It works only at a kiosk for drop-off and pick-up,
            and never signs anyone in to this portal.
          </span>
        </p>
      ) : (
        state?.message && <p className="mb-1.5 text-[11px] text-red-600">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="text-[11px] font-medium text-gray-400 hover:text-[var(--brand-primary)] disabled:opacity-50"
      >
        {pending ? "Generating…" : state?.pin ? "Generate a new kiosk PIN" : "Kiosk PIN"}
      </button>
    </form>
  );
}
