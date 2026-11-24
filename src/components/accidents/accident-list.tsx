"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { ParentNotifiedReminder } from "@/components/accidents/accident-notes";
import { ACCIDENT_STATUS_LABELS, clockTime } from "@/lib/accidents/model";
import type { AccidentStatus } from "@/types/database.types";

export interface AccidentRow {
  id: string;
  childName: string;
  locationId: string;
  locationName: string;
  occurredOn: string;
  occurredTime: string;
  injuryType: string;
  bodyPart: string;
  status: AccidentStatus;
  parentNotified: boolean;
  oolReportable: boolean;
}

const STATUS_TONE: Record<AccidentStatus, string> = {
  open: "bg-amber-50 text-amber-700",
  reviewed: "bg-blue-50 text-blue-700",
  closed: "bg-gray-100 text-gray-600",
};

export function AccidentList({ rows, locations }: { rows: AccidentRow[]; locations: string[] }) {
  const [campus, setCampus] = useState("All");
  const [status, setStatus] = useState("All");
  const [ool, setOol] = useState("All");

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const campusOk = campus === "All" || row.locationName === campus;
        const statusOk = status === "All" || row.status === status;
        const oolOk = ool === "All" || (ool === "yes" ? row.oolReportable : !row.oolReportable);
        return campusOk && statusOk && oolOk;
      }),
    [rows, campus, status, ool],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4.5 py-3.5">
        <h1 className="mr-auto font-serif text-[15px] font-semibold text-gray-900">Accident reports</h1>
        <select
          value={campus}
          onChange={(event) => setCampus(event.target.value)}
          className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-[13px] text-gray-700"
          aria-label="Campus"
        >
          <option value="All">All campuses</option>
          {locations.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-[13px] text-gray-700"
          aria-label="Status"
        >
          <option value="All">All statuses</option>
          <option value="open">Open</option>
          <option value="reviewed">Reviewed</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={ool}
          onChange={(event) => setOol(event.target.value)}
          className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-[13px] text-gray-700"
          aria-label="Office of Licensing"
        >
          <option value="All">OOL and not</option>
          <option value="yes">OOL reportable</option>
          <option value="no">Not OOL</option>
        </select>
      </div>

      <ul className="divide-y divide-gray-100">
        {filtered.map((row) => (
          <li key={row.id}>
            <Link href={`/accidents/${row.id}`} className="block px-4.5 py-3 hover:bg-gray-50">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold text-gray-900">{row.childName}</span>
                <span className="text-[11.5px] text-gray-400">
                  {row.locationName} · {row.occurredOn} {clockTime(row.occurredTime)}
                </span>
                {row.oolReportable && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold tracking-[.06em] text-red-700 uppercase">
                    OOL
                  </span>
                )}
                <span
                  className={`ml-auto rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${STATUS_TONE[row.status]}`}
                >
                  {ACCIDENT_STATUS_LABELS[row.status]}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-gray-600">
                {row.injuryType} · {row.bodyPart}
              </p>
              <div className="mt-2">
                <ParentNotifiedReminder notified={row.parentNotified} />
              </div>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4.5 py-6 text-center text-sm text-gray-500">No accident reports match.</li>
        )}
      </ul>
    </div>
  );
}
