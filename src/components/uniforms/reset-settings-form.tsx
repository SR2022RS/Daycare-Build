"use client";

import { useActionState } from "react";

import { saveUniformSettings } from "@/lib/uniforms/actions";
import { RESET_LABELS, type UniformReset } from "@/lib/uniforms/steps";

const field =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

export function ResetSettingsForm({
  resetMode,
  startMonth,
  startDay,
}: {
  resetMode: UniformReset;
  startMonth: number;
  startDay: number;
}) {
  const [state, action, pending] = useActionState(saveUniformSettings, undefined);

  return (
    <form action={action} className="mt-4 rounded-xl border border-gray-200 bg-white px-4.5 py-4">
      <h2 className="text-[14px] font-semibold text-gray-900">How the count resets</h2>
      <p className="mt-1 text-[12.5px] text-gray-500">
        Default is each school year, starting September 1. Changing this does not rewrite warnings already logged.
      </p>
      {state?.message && (
        <p
          className={`mt-2 rounded-md px-3 py-2 text-[12.5px] ${
            state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-gray-500">
          Reset
          <select name="resetMode" defaultValue={resetMode} className={`mt-1 ${field}`}>
            {(Object.keys(RESET_LABELS) as UniformReset[]).map((mode) => (
              <option key={mode} value={mode}>
                {RESET_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          School year starts (month)
          <input
            type="number"
            name="startMonth"
            min={1}
            max={12}
            defaultValue={startMonth}
            className={`mt-1 w-24 ${field}`}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Day
          <input
            type="number"
            name="startDay"
            min={1}
            max={28}
            defaultValue={startDay}
            className={`mt-1 w-24 ${field}`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
