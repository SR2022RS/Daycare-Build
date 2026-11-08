"use client";

import { useActionState } from "react";

import { saveChildPeople } from "@/lib/children/actions";
import { CHILD_STATUS_LABELS, FUNDING_TYPE_LABELS, SCHEDULE_LABELS } from "@/lib/children/labels";
import type { ChildSchedule, ChildStatus, FundingType } from "@/types/database.types";

export interface ChildPeopleValues {
  childId: string;
  fullName: string;
  dob: string;
  locationId: string | null;
  roomId: string | null;
  classroom: string | null;
  status: ChildStatus;
  schedule: ChildSchedule;
  fundingType: FundingType;
  startDate: string | null;
  desiredStartDate: string | null;
  pickupCodeWord: string | null;
}

export interface NamedOption {
  id: string;
  name: string;
}

const field =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

/**
 * The staff-facing child form, for both adding and editing.
 *
 * Carries no rate fields at all -- not hidden ones, not disabled ones. It
 * posts to `saveChildPeople`, which routes through an RPC that has no rate
 * parameter, so there is nothing here for a price to travel in even if the
 * markup were edited in a browser.
 *
 * "Who pays" is the funding TYPE (private / 4Cs / mixed), which is a fact
 * about the family that staff take at the door. The amounts attached to it
 * stay with the director.
 */
export function StaffChildForm({
  locations,
  rooms,
  child,
  onDoneLabel = "Save",
}: {
  locations: NamedOption[];
  rooms: NamedOption[];
  child?: ChildPeopleValues;
  onDoneLabel?: string;
}) {
  const [state, action, pending] = useActionState(saveChildPeople, undefined);

  return (
    <form action={action} className="grid grid-cols-1 gap-2.5 p-4.5 sm:grid-cols-2">
      {child && <input type="hidden" name="childId" value={child.childId} />}

      {state?.message && (
        <p
          className={`rounded-md px-3 py-2 text-[12.5px] sm:col-span-2 ${
            state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}

      <input
        name="fullName"
        placeholder="Full name"
        required
        defaultValue={child?.fullName ?? ""}
        className={`${field} sm:col-span-2`}
      />

      <label className="flex flex-col text-xs text-gray-500">
        Date of birth
        <input type="date" name="dob" required defaultValue={child?.dob ?? ""} className={`mt-1 ${field}`} />
      </label>

      <label className="flex flex-col text-xs text-gray-500">
        Campus
        <select
          name="locationId"
          required
          defaultValue={child?.locationId ?? ""}
          className={`mt-1 ${field}`}
        >
          <option value="" disabled>
            Select a campus
          </option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs text-gray-500">
        Room
        <select name="roomId" defaultValue={child?.roomId ?? ""} className={`mt-1 ${field}`}>
          <option value="">
            {rooms.length === 0 ? "No rooms set up yet" : "Not assigned"}
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs text-gray-500">
        Status
        <select name="status" defaultValue={child?.status ?? "active"} className={`mt-1 ${field}`}>
          {Object.entries(CHILD_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs text-gray-500">
        Schedule
        <select name="schedule" defaultValue={child?.schedule ?? "full_time"} className={`mt-1 ${field}`}>
          {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs text-gray-500">
        Who pays
        <select
          name="fundingType"
          defaultValue={child?.fundingType ?? "private"}
          className={`mt-1 ${field}`}
        >
          {Object.entries(FUNDING_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs text-gray-500">
        Start date
        <input
          type="date"
          name="startDate"
          defaultValue={child?.startDate ?? ""}
          className={`mt-1 ${field}`}
        />
      </label>

      <label className="flex flex-col text-xs text-gray-500">
        Wanted start (waitlist)
        <input
          type="date"
          name="desiredStartDate"
          defaultValue={child?.desiredStartDate ?? ""}
          className={`mt-1 ${field}`}
        />
      </label>

      <input
        name="pickupCodeWord"
        placeholder="Pickup code word"
        defaultValue={child?.pickupCodeWord ?? ""}
        className={field}
      />

      <input
        name="classroom"
        placeholder="Classroom label (optional)"
        defaultValue={child?.classroom ?? ""}
        className={field}
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:opacity-50 sm:col-span-2"
      >
        {pending ? "Saving…" : onDoneLabel}
      </button>

      <p className="text-[11.5px] text-gray-400 sm:col-span-2">
        Rates and balances are set by a director and are not shown here.
      </p>
    </form>
  );
}
