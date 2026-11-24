import Link from "next/link";

import { ParentNotifiedReminder } from "@/components/accidents/accident-notes";
import { ACCIDENT_STATUS_LABELS, clockTime } from "@/lib/accidents/model";
import type { AccidentStatus } from "@/types/database.types";

export interface ChildAccidentLink {
  id: string;
  occurredOn: string;
  occurredTime: string;
  injuryType: string;
  bodyPart: string;
  status: AccidentStatus;
  parentNotified: boolean;
}

export function ChildAccidents({
  reports,
  unavailable,
}: {
  reports: ChildAccidentLink[];
  unavailable: boolean;
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4.5 py-3.5">
        <h2 className="text-[15px] font-semibold text-gray-900">Accidents</h2>
        <Link href="/accidents" className="text-[12.5px] font-semibold text-[var(--brand-primary)] hover:opacity-80">
          Accident reports
        </Link>
      </div>
      {unavailable ? (
        <p className="px-4.5 py-3 text-[13px] text-amber-900">Accident reports could not be loaded.</p>
      ) : reports.length === 0 ? (
        <p className="px-4.5 py-3 text-[13px] text-gray-500">
          No accident reports to show.{" "}
          <Link href="/accidents" className="font-semibold text-[var(--brand-primary)]">
            File one
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {reports.map((report) => (
            <li key={report.id} className="px-4.5 py-3">
              <Link href={`/accidents/${report.id}`} className="text-[13.5px] font-semibold text-gray-900 hover:text-[var(--brand-primary)]">
                {report.occurredOn} {clockTime(report.occurredTime)} · {report.injuryType} · {report.bodyPart}
              </Link>
              <p className="mt-0.5 text-[11.5px] text-gray-400">{ACCIDENT_STATUS_LABELS[report.status]}</p>
              <div className="mt-2">
                <ParentNotifiedReminder notified={report.parentNotified} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
