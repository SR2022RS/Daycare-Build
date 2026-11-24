"use client";

import { useState } from "react";
import { useActionState } from "react";

import { OolDeadline, ParentNotifiedReminder } from "@/components/accidents/accident-notes";
import { updateAccidentReport } from "@/lib/accidents/actions";
import { ACCIDENT_STATUS_LABELS, NOTIFY_METHOD_LABELS, clockTime } from "@/lib/accidents/model";
import type { AccidentStatus, ParentNotifyMethod } from "@/types/database.types";

const field =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

export interface AccidentDetail {
  id: string;
  childId: string;
  childName: string;
  locationId: string;
  locationName: string;
  occurredOn: string;
  occurredTime: string;
  place: string;
  whatHappened: string;
  injuryType: string;
  bodyPart: string;
  firstAid: string;
  staffPresent: string;
  witnesses: string | null;
  parentNotified: boolean;
  parentNotifiedOn: string | null;
  parentNotifiedTime: string | null;
  parentNotifyMethod: ParentNotifyMethod | null;
  parentNotifiedBy: string | null;
  oolReportable: boolean;
  parentSignatureName: string | null;
  parentSignedOn: string | null;
  status: AccidentStatus;
  filedByName: string;
}

export function AccidentEditor({
  report,
  canEdit,
  locations,
  enrolled,
}: {
  report: AccidentDetail;
  canEdit: boolean;
  locations: { id: string; name: string }[];
  enrolled: { id: string; fullName: string; locationId: string }[];
}) {
  if (!canEdit) return <AccidentRead report={report} />;
  return <AccidentForm report={report} locations={locations} enrolled={enrolled} />;
}

function AccidentRead({ report }: { report: AccidentDetail }) {
  const rows: { label: string; value: string }[] = [
    { label: "When", value: `${report.occurredOn} ${clockTime(report.occurredTime)}` },
    { label: "Campus", value: report.locationName },
    { label: "Where", value: report.place },
    { label: "What happened", value: report.whatHappened },
    { label: "Injury", value: `${report.injuryType} · ${report.bodyPart}` },
    { label: "First aid", value: report.firstAid },
    { label: "Staff", value: report.staffPresent },
    { label: "Witnesses", value: report.witnesses?.trim() || "None recorded" },
    {
      label: "Parent notified",
      value: report.parentNotified
        ? `${report.parentNotifiedOn} ${report.parentNotifiedTime ? clockTime(report.parentNotifiedTime) : ""} · ${
            report.parentNotifyMethod ? NOTIFY_METHOD_LABELS[report.parentNotifyMethod] : ""
          } · ${report.parentNotifiedBy ?? ""}`
        : "No",
    },
    {
      label: "Parent signature",
      value: report.parentSignatureName
        ? `${report.parentSignatureName} on ${report.parentSignedOn} (record only)`
        : "Not recorded",
    },
    { label: "Status", value: ACCIDENT_STATUS_LABELS[report.status] },
    { label: "Filed by", value: report.filedByName },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ParentNotifiedReminder notified={report.parentNotified} />
      <OolDeadline occurredOn={report.occurredOn} reportable={report.oolReportable} />
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] font-semibold tracking-[.06em] text-gray-400 uppercase">{row.label}</dt>
            <dd className="mt-0.5 text-[13px] whitespace-pre-wrap text-gray-800">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12px] text-gray-400">View only. A director or site lead can update this.</p>
    </div>
  );
}

function AccidentForm({
  report,
  locations,
  enrolled,
}: {
  report: AccidentDetail;
  locations: { id: string; name: string }[];
  enrolled: { id: string; fullName: string; locationId: string }[];
}) {
  const [state, action, pending] = useActionState(updateAccidentReport, undefined);
  const [locationId, setLocationId] = useState(report.locationId);
  const [notified, setNotified] = useState(report.parentNotified);
  const [reportable, setReportable] = useState(report.oolReportable);
  const [occurredOn, setOccurredOn] = useState(report.occurredOn);
  const atCampus = enrolled.filter((child) => child.locationId === locationId);

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="reportId" value={report.id} />
      <ParentNotifiedReminder notified={notified} />
      <OolDeadline occurredOn={occurredOn} reportable={reportable} />
      {state?.message && (
        <p
          className={`rounded-md px-3 py-2 text-[12.5px] ${
            state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}

      <label className="flex flex-col text-xs text-gray-500">
        Status
        <select name="status" defaultValue={report.status} className={`mt-1 ${field}`}>
          {(Object.keys(ACCIDENT_STATUS_LABELS) as AccidentStatus[]).map((status) => (
            <option key={status} value={status}>
              {ACCIDENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Campus
        <select
          name="locationId"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          className={`mt-1 ${field}`}
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Child
        <select name="childId" defaultValue={report.childId} className={`mt-1 ${field}`}>
          {atCampus.map((child) => (
            <option key={child.id} value={child.id}>
              {child.fullName}
            </option>
          ))}
          {!atCampus.some((child) => child.id === report.childId) && (
            <option value={report.childId}>{report.childName}</option>
          )}
        </select>
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        <label className="flex flex-col text-xs text-gray-500">
          Time
          <input
            type="time"
            name="occurredTime"
            required
            defaultValue={clockTime(report.occurredTime)}
            className={`mt-1 ${field}`}
          />
        </label>
      </div>
      <label className="flex flex-col text-xs text-gray-500">
        Where
        <input name="place" required defaultValue={report.place} className={`mt-1 ${field}`} />
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        What happened
        <textarea name="whatHappened" required rows={3} defaultValue={report.whatHappened} className={`mt-1 ${field}`} />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-gray-500">
          Injury type
          <input name="injuryType" required defaultValue={report.injuryType} className={`mt-1 ${field}`} />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Body part
          <input name="bodyPart" required defaultValue={report.bodyPart} className={`mt-1 ${field}`} />
        </label>
      </div>
      <label className="flex flex-col text-xs text-gray-500">
        First aid given
        <textarea name="firstAid" required rows={2} defaultValue={report.firstAid} className={`mt-1 ${field}`} />
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Staff present
        <input name="staffPresent" required defaultValue={report.staffPresent} className={`mt-1 ${field}`} />
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Witnesses
        <input name="witnesses" defaultValue={report.witnesses ?? ""} className={`mt-1 ${field}`} />
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
            <input
              type="date"
              name="parentNotifiedOn"
              required
              defaultValue={report.parentNotifiedOn ?? ""}
              className={`mt-1 ${field}`}
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Time
            <input
              type="time"
              name="parentNotifiedTime"
              required
              defaultValue={report.parentNotifiedTime ? clockTime(report.parentNotifiedTime) : ""}
              className={`mt-1 ${field}`}
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            How
            <select
              name="parentNotifyMethod"
              required
              defaultValue={report.parentNotifyMethod ?? ""}
              className={`mt-1 ${field}`}
            >
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
            <input
              name="parentNotifiedBy"
              required
              defaultValue={report.parentNotifiedBy ?? ""}
              className={`mt-1 ${field}`}
            />
          </label>
        </div>
      )}

      <label className="flex items-center gap-2 text-[13px] text-gray-800">
        <input
          type="checkbox"
          name="oolReportable"
          checked={reportable}
          onChange={(event) => setReportable(event.target.checked)}
          className="h-3.5 w-3.5"
        />
        Office of Licensing reportable
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-gray-500">
          Parent signature (record only)
          <input
            name="parentSignatureName"
            defaultValue={report.parentSignatureName ?? ""}
            placeholder="Name signed at pickup"
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Signed on
          <input
            type="date"
            name="parentSignedOn"
            defaultValue={report.parentSignedOn ?? ""}
            className={`mt-1 ${field}`}
          />
        </label>
      </div>
      <p className="text-[11.5px] text-gray-400">The signature is recorded here. The parent is not contacted.</p>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save report"}
      </button>
    </form>
  );
}
