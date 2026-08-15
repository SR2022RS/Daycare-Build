"use client";

import { useActionState } from "react";

import { enrollFromWaitlist, type WaitlistActionState } from "@/lib/rooms/actions";

export function EnrollForm({
  childId,
  roomId,
  defaultStartDate,
}: {
  childId: string;
  roomId: string | null;
  defaultStartDate: string;
}) {
  const [state, action, pending] = useActionState<WaitlistActionState, FormData>(
    enrollFromWaitlist,
    undefined,
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="childId" value={childId} />
      {roomId && <input type="hidden" name="roomId" value={roomId} />}
      <label className="flex flex-col text-[11px] text-gray-500">
        Start date
        <input
          type="date"
          name="startDate"
          defaultValue={defaultStartDate}
          required
          className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-[13px] focus:border-[var(--brand-accent)] focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[#06323A] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Enrolling…" : "Enroll"}
      </button>
      {state?.message && (
        <p role="alert" className="w-full text-[12px] font-medium text-red-700">
          {state.message}
        </p>
      )}
      <p className="w-full text-[11px] text-gray-400">
        Enrolling starts billing from the start date.
      </p>
    </form>
  );
}
