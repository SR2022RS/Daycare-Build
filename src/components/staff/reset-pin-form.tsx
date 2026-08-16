"use client";

import { useActionState } from "react";

import { resetStaffPin } from "@/lib/kiosk/actions";

export function ResetPinForm({ staffId }: { staffId: string }) {
  const [state, action, pending] = useActionState(resetStaffPin, undefined);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="staffId" value={staffId} />
      {state?.pin ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          New kiosk PIN: <span className="font-mono text-base font-semibold tracking-widest">{state.pin}</span>
          <br />
          <span className="text-xs text-green-700">
            Shown once &mdash; write it down or hand it to them now. Works only at a registered kiosk device.
          </span>
        </p>
      ) : (
        state?.message && <p className="text-xs text-red-600">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "Generating…" : state?.pin ? "Generate a new PIN" : "Assign kiosk PIN"}
      </button>
    </form>
  );
}
