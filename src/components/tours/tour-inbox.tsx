"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";

import { updateTourRequest } from "@/lib/tours/actions";
import { TOUR_STATUS_LABELS, TOUR_STATUSES } from "@/lib/tours/labels";
import type { TourStatus } from "@/types/database.types";

const field =
  "rounded-md border border-gray-300 px-2 py-1.5 text-[13px] focus:border-[#6E1F2E] focus:outline-none";

export interface TourInboxRow {
  id: string;
  parentName: string;
  phone: string;
  email: string;
  childAges: string;
  desiredStart: string | null;
  campusName: string;
  preferredTime: string | null;
  heardAbout: string | null;
  notes: string | null;
  status: TourStatus;
  adminNotes: string | null;
  createdOn: string;
}

export function TourInbox({ rows, campuses }: { rows: TourInboxRow[]; campuses: string[] }) {
  const [campus, setCampus] = useState("All");
  const [status, setStatus] = useState("All");
  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const campusOk = campus === "All" || row.campusName === campus;
        const statusOk = status === "All" || row.status === status;
        return campusOk && statusOk;
      }),
    [rows, campus, status],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4.5 py-3.5">
        <h1 className="mr-auto font-serif text-[15px] font-semibold text-gray-900">Tour requests</h1>
        <select
          value={campus}
          onChange={(event) => setCampus(event.target.value)}
          aria-label="Campus"
          className="h-[34px] rounded-lg border border-gray-200 px-2 text-[13px]"
        >
          <option value="All">All campuses</option>
          {campuses.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Status"
          className="h-[34px] rounded-lg border border-gray-200 px-2 text-[13px]"
        >
          <option value="All">All statuses</option>
          {TOUR_STATUSES.map((value) => (
            <option key={value} value={value}>
              {TOUR_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <ul className="divide-y divide-gray-100">
        {filtered.map((row) => (
          <li key={row.id} className="px-4.5 py-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[14px] font-semibold text-gray-900">{row.parentName}</span>
              <span className="text-[12px] text-gray-400">
                {row.campusName} · {row.createdOn}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-gray-700">
              {row.phone} · {row.email}
            </p>
            <p className="mt-1 text-[13px] text-gray-600">
              Ages {row.childAges}
              {row.desiredStart ? ` · start ${row.desiredStart}` : ""}
              {row.preferredTime ? ` · ${row.preferredTime}` : ""}
              {row.heardAbout ? ` · heard via ${row.heardAbout}` : ""}
            </p>
            {row.notes && <p className="mt-1 text-[13px] whitespace-pre-wrap text-gray-600">{row.notes}</p>}
            <TourUpdate row={row} />
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4.5 py-6 text-center text-sm text-gray-500">No tour requests match.</li>
        )}
      </ul>
    </div>
  );
}

function TourUpdate({ row }: { row: TourInboxRow }) {
  const [state, action, pending] = useActionState(updateTourRequest, undefined);

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="requestId" value={row.id} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-gray-500">
          Status
          <select name="status" defaultValue={row.status} className={`ml-1 ${field}`}>
            {TOUR_STATUSES.map((value) => (
              <option key={value} value={value}>
                {TOUR_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.message && (
          <span className={`text-[12px] ${state.ok ? "text-green-700" : "text-red-700"}`}>{state.message}</span>
        )}
      </div>
      <label className="text-[11px] text-gray-500">
        Admin notes
        <textarea
          name="adminNotes"
          rows={2}
          defaultValue={row.adminNotes ?? ""}
          className={`mt-1 w-full ${field}`}
        />
      </label>
    </form>
  );
}
