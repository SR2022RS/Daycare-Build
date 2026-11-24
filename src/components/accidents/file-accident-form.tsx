"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";

import { fileAccidentReport } from "@/lib/accidents/actions";
import { NOTIFY_METHOD_LABELS } from "@/lib/accidents/model";
import type { ParentNotifyMethod } from "@/types/database.types";

const field =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

export interface AccidentChildOption {
  id: string;
  fullName: string;
  locationId: string;
}

export function FileAccidentForm({
  locations,
  enrolled,
}: {
  locations: { id: string; name: string }[];
  enrolled: AccidentChildOption[];
}) {
  const [state, action, pending] = useActionState(fileAccidentReport, undefined);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [notified, setNotified] = useState(false);
  const [reportable, setReportable] = useState(false);

  const atCampus = useMemo(
    () => enrolled.filter((child) => child.locationId === locationId),
    [enrolled, locationId],
  );

  return (
    <form action={action} className="flex flex-col gap-2.5 border-t border-gray-100 p-4.5">
      {state?.message && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{state.message}</p>
      )}

      <label className="flex flex-col text-xs text-gray-500">
        Campus
        <select
          name="locationId"
          required
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
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
        <select key={locationId} name="childId" required defaultValue="" className={`mt-1 ${field}`}>
          <option value="" disabled>
            {atCampus.length === 0 ? "No children at this campus" : "Select a child"}
          </option>
          {atCampus.map((child) => (
            <option key={child.id} value={child.id}>
              {child.fullName}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-gray-500">
          Date
          <input type="date" name="occurredOn" required className={`mt-1 ${field}`} />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Time
          <input type="time" name="occurredTime" required className={`mt-1 ${field}`} />
        </label>
      </div>

      <label className="flex flex-col text-xs text-gray-500">
        Where
        <input name="place" required placeholder="Playground, classroom, bathroom" className={`mt-1 ${field}`} />
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        What happened
        <textarea name="whatHappened" required rows={3} className={`mt-1 ${field}`} />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-gray-500">
          Injury type
          <input name="injuryType" required placeholder="Scrape, bite, bump, bruise" className={`mt-1 ${field}`} />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Body part
          <input name="bodyPart" required placeholder="Left knee" className={`mt-1 ${field}`} />
        </label>
      </div>
      <label className="flex flex-col text-xs text-gray-500">
        First aid given
        <textarea name="firstAid" required rows={2} className={`mt-1 ${field}`} />
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Staff present
        <input name="staffPresent" required placeholder="Names of staff who were there" className={`mt-1 ${field}`} />
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Witnesses
        <input name="witnesses" placeholder="Optional" className={`mt-1 ${field}`} />
      </label>

      <label className="flex items-center gap-2 text-[13px] text-gray-800">
        <input
          type="checkbox"
          name="parentNotified"
          checked={notified}
          onChange={(event) => setNotified(event.target.checked)}
          className="h-3.5 w-3.5"
        />
        Parent was notified
      </label>
      {notified && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col text-xs text-gray-500">
            Notified on
            <input type="date" name="parentNotifiedOn" required className={`mt-1 ${field}`} />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Time
            <input type="time" name="parentNotifiedTime" required className={`mt-1 ${field}`} />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            How
            <select name="parentNotifyMethod" required defaultValue="" className={`mt-1 ${field}`}>
              <option value="" disabled>
                Choose
              </option>
              {(Object.keys(NOTIFY_METHOD_LABELS) as ParentNotifyMethod[]).map((method) => (
                <option key={method} value={method}>
                  {NOTIFY_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            By whom
            <input name="parentNotifiedBy" required placeholder="Staff name" className={`mt-1 ${field}`} />
          </label>
        </div>
      )}

      <label className="flex items-start gap-2 text-[13px] text-gray-800">
        <input
          type="checkbox"
          name="oolReportable"
          checked={reportable}
          onChange={(event) => setReportable(event.target.checked)}
          className="mt-0.5 h-3.5 w-3.5"
        />
        <span>
          Office of Licensing reportable
          <span className="mt-0.5 block text-[11.5px] text-gray-500">
            Emergency room, hospital, death, 911, on-site emergency care, or urgent care. Nothing is sent
            from here.
          </span>
        </span>
      </label>
      {reportable && (
        <p className="text-[12px] text-gray-500">
          The deadline is shown on the report after you file it, counted from the date above.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-gray-500">
          Parent signature (record only)
          <input name="parentSignatureName" placeholder="Name signed at pickup" className={`mt-1 ${field}`} />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Signed on
          <input type="date" name="parentSignedOn" className={`mt-1 ${field}`} />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending || locations.length === 0}
        className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Filing…" : "File report"}
      </button>
    </form>
  );
}
