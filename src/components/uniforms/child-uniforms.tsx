import Link from "next/link";

import { STEP_LABELS } from "@/lib/uniforms/steps";
import type { UniformStep } from "@/types/database.types";

export interface ChildUniformItem {
  id: string;
  occurredOn: string;
  missingItem: string;
  step: UniformStep;
  feeDue: boolean;
}

export function ChildUniforms({
  summary,
  items,
  unavailable,
}: {
  summary: string;
  items: ChildUniformItem[];
  unavailable: boolean;
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4.5 py-3.5">
        <h2 className="text-[15px] font-semibold text-gray-900">Uniform</h2>
        <Link href="/uniforms" className="text-[12.5px] font-semibold text-[var(--brand-primary)] hover:opacity-80">
          Uniform log
        </Link>
      </div>
      {unavailable ? (
        <p className="px-4.5 py-3 text-[13px] text-amber-900">Uniform warnings could not be loaded.</p>
      ) : (
        <div className="px-4.5 py-3">
          <p className="text-[13px] text-gray-800">{summary}</p>
          {items.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-gray-500">No warnings to show.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {items.map((item) => (
                <li key={item.id} className="py-2">
                  <Link
                    href={`/uniforms/${item.id}`}
                    className="text-[13px] font-semibold text-gray-900 hover:text-[var(--brand-primary)]"
                  >
                    {item.occurredOn} · {item.missingItem}
                  </Link>
                  <p className="text-[11.5px] text-gray-400">
                    {item.feeDue ? "Fee due — $10" : STEP_LABELS[item.step]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
