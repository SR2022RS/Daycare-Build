"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";

import { fileUniformWarning } from "@/lib/uniforms/actions";
import {
  STEP_LABELS,
  dressForDate,
  inWindow,
  stepForCount,
  windowStart,
  type UniformReset,
} from "@/lib/uniforms/steps";

const field =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

export interface UniformChildOption {
  id: string;
  fullName: string;
  locationId: string;
}

export function FileUniformForm({
  locations,
  enrolled,
  prior,
  resetMode,
  startMonth,
  startDay,
  today,
}: {
  locations: { id: string; name: string }[];
  enrolled: UniformChildOption[];
  prior: { childId: string; occurredOn: string }[];
  resetMode: UniformReset;
  startMonth: number;
  startDay: number;
  today: string;
}) {
  const [state, action, pending] = useActionState(fileUniformWarning, undefined);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [childId, setChildId] = useState("");
  const [occurredOn, setOccurredOn] = useState(today);
  const atCampus = enrolled.filter((child) => child.locationId === locationId);
  const dress = dressForDate(occurredOn);

  const nextStep = useMemo(() => {
    if (!childId || !occurredOn) return null;
    const start = windowStart(resetMode, occurredOn, startMonth, startDay);
    const existing = prior.filter((row) => row.childId === childId && inWindow(row.occurredOn, start)).length;
    return stepForCount(existing);
  }, [childId, occurredOn, prior, resetMode, startMonth, startDay]);

  return (
    <form action={action} className="flex flex-col gap-2.5 border-t border-gray-100 p-4.5">
      <p className="text-[12.5px] text-gray-600">
        <span className="font-semibold text-gray-900">{dress.title}.</span> {dress.detail}
      </p>
      {state?.message && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{state.message}</p>
      )}
      <label className="flex flex-col text-xs text-gray-500">
        Campus
        <select
          name="locationId"
          required
          value={locationId}
          onChange={(event) => {
            setLocationId(event.target.value);
            setChildId("");
          }}
          className={`mt-1 ${field}`}
        >
          {locations.length === 0 && <option value="">No campus assigned</option>}
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Child
        <select
          name="childId"
          required
          value={childId}
          onChange={(event) => setChildId(event.target.value)}
          className={`mt-1 ${field}`}
        >
          <option value="">{atCampus.length === 0 ? "No children at this campus" : "Select a child"}</option>
          {atCampus.map((child) => (
            <option key={child.id} value={child.id}>
              {child.fullName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Date
        <input
          type="date"
          name="occurredOn"
          required
          value={occurredOn}
          onChange={(event) => setOccurredOn(event.target.value)}
          className={`mt-1 ${field}`}
        />
      </label>
      {nextStep && (
        <p className="text-[12.5px] text-gray-700">
          This will be recorded as <span className="font-semibold">{STEP_LABELS[nextStep]}</span>
          {nextStep === "fee" ? " — $10 fee due. It is not sent to billing." : "."}
        </p>
      )}
      <label className="flex flex-col text-xs text-gray-500">
        What was missing
        <input name="missingItem" required placeholder="Polo, khakis, sweatsuit, closed-toe shoes" className={`mt-1 ${field}`} />
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Note
        <textarea name="note" rows={2} className={`mt-1 ${field}`} />
      </label>
      <button
        type="submit"
        disabled={pending || locations.length === 0}
        className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Log warning"}
      </button>
    </form>
  );
}
