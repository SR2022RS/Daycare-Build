"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { STEP_LABELS } from "@/lib/uniforms/steps";
import type { UniformStep } from "@/types/database.types";

export interface UniformListRow {
  id: string;
  childName: string;
  locationName: string;
  occurredOn: string;
  missingItem: string;
  step: UniformStep;
  feeDue: boolean;
}

const TONE: Record<UniformStep, string> = {
  verbal: "bg-gray-100 text-gray-600",
  written: "bg-amber-50 text-amber-800",
  fee: "bg-red-50 text-red-700",
};

export function UniformList({ rows, campuses }: { rows: UniformListRow[]; campuses: string[] }) {
  const [campus, setCampus] = useState("All");
  const [step, setStep] = useState("All");

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const campusOk = campus === "All" || row.locationName === campus;
        const stepOk = step === "All" || row.step === step;
        return campusOk && stepOk;
      }),
    [rows, campus, step],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4.5 py-3.5">
        <h1 className="mr-auto font-serif text-[15px] font-semibold text-gray-900">Out of uniform</h1>
        <select
          value={campus}
          onChange={(event) => setCampus(event.target.value)}
          aria-label="Campus"
          className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-[13px] text-gray-700"
        >
          <option value="All">All campuses</option>
          {campuses.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={step}
          onChange={(event) => setStep(event.target.value)}
          aria-label="Step"
          className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-[13px] text-gray-700"
        >
          <option value="All">All steps</option>
          <option value="verbal">Verbal</option>
          <option value="written">Written</option>
          <option value="fee">Fee due</option>
        </select>
      </div>
      <ul className="divide-y divide-gray-100">
        {filtered.map((row) => (
          <li key={row.id}>
            <Link href={`/uniforms/${row.id}`} className="block px-4.5 py-3 hover:bg-gray-50">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold text-gray-900">{row.childName}</span>
                <span className="text-[11.5px] text-gray-400">
                  {row.locationName} · {row.occurredOn}
                </span>
                <span
                  className={`ml-auto rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${TONE[row.step]}`}
                >
                  {row.feeDue ? "Fee due" : STEP_LABELS[row.step]}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-gray-600">{row.missingItem}</p>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4.5 py-6 text-center text-sm text-gray-500">No uniform warnings match.</li>
        )}
      </ul>
    </div>
  );
}
