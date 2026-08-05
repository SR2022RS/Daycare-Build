"use client";

import { useEffect, useState } from "react";

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="text-[10px] font-bold tracking-[.18em] text-gray-400 uppercase">
        {now
          ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()
          : " "}
      </div>
      <div className="mt-2 font-serif text-[46px] font-medium tracking-[.02em] text-gray-900 tabular-nums">
        {now
          ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })
          : "--:--:--"}
      </div>
    </>
  );
}
