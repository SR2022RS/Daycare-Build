"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { INTENSIVE, eventStartUTC } from "@/lib/intensive/config";

/**
 * Mobile-only bottom bar that appears once the hero has scrolled away.
 * Hidden on desktop, where the closing CTA is never far enough off-screen to
 * justify covering content.
 */
export function StickyCta({ subtitle }: { subtitle: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // The session having started removes the bar entirely -- there is
    // nothing left to reserve.
    if (Date.now() > eventStartUTC()) return;

    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3.5 border-t border-[rgba(227,12,123,.3)] bg-[rgba(10,10,13,.96)] px-4 py-2.5 backdrop-blur-md md:hidden">
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[13.5px] text-[#F5F3EE]">{INTENSIVE.name}</p>
        <p className="truncate text-[11.5px] text-[#8C857C]">{subtitle}</p>
      </div>
      <Link
        href="/intensive/checkout"
        className="intensive-cta flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-5 text-[13px] font-bold tracking-[.04em] text-white"
      >
        Reserve — ${INTENSIVE.price}
      </Link>
    </div>
  );
}
