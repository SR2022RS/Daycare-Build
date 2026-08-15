"use client";

import { useId, useState } from "react";

import type { Faq } from "@/lib/intensive/config";

/**
 * One-at-a-time accordion. Uses real buttons with aria-expanded/aria-controls
 * rather than <details>, so the open panel can be styled differently for
 * draft copy without fighting the disclosure widget's default rendering.
 */
export function FaqList({ items }: { items: Faq[] }) {
  const [open, setOpen] = useState(0);
  const baseId = useId();

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => {
        const expanded = open === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;

        return (
          <div
            key={item.question}
            className="overflow-hidden rounded-[10px] border border-[#E6E9EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,.05)]"
          >
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? -1 : index)}
                className="flex w-full items-center justify-between gap-3.5 px-[18px] py-4 text-left hover:bg-[#FBFCFD]"
              >
                <span className="text-[15px] font-semibold leading-snug text-[#0F172A]">
                  {item.question}
                </span>
                <span aria-hidden="true" className="shrink-0 text-lg leading-none text-brand-primary">
                  {expanded ? "−" : "+"}
                </span>
              </button>
            </h3>

            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!expanded}>
              {item.draft ? (
                // Placeholder copy that must never reach a buyer. Rendered as
                // a visible warning rather than hidden, so it cannot be
                // forgotten before launch.
                <div className="mx-[18px] mb-[18px] rounded-lg border border-dashed border-[#FC9024] bg-[#FFF6EC] px-[15px] py-3.5">
                  <p className="text-[9.5px] font-bold uppercase tracking-[.13em] text-[#B4530A]">
                    Awaiting Shikara · do not publish
                  </p>
                  <p className="mt-[7px] text-[14.5px] leading-relaxed text-[#475569]">
                    {item.answer}
                  </p>
                </div>
              ) : (
                <div className="px-[18px] pb-[18px] text-[14.5px] leading-[1.68] text-[#475569]">
                  {item.answer}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
