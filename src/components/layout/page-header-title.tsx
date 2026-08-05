"use client";

import { usePathname } from "next/navigation";

import type { AppRole } from "@/types/database.types";

function getTitle(pathname: string, role: AppRole): { title: string; subtitle?: string } {
  const isStaff = role === "staff";

  if (pathname.startsWith("/dashboard")) return { title: "Director Dashboard" };
  if (pathname.startsWith("/staff/")) return { title: "Personnel Record", subtitle: "Attendance, credentials and write-ups" };
  if (pathname.startsWith("/staff")) return { title: "Staff Directory" };
  if (pathname.startsWith("/training")) {
    return isStaff ? { title: "My Coursework" } : { title: "Coursework" };
  }
  if (pathname.startsWith("/attendance")) {
    return isStaff ? { title: "Time Clock" } : { title: "Attendance" };
  }
  if (pathname.startsWith("/policies")) return { title: "Policies Library" };
  if (pathname.startsWith("/settings")) return { title: "Settings" };
  return { title: "AKPA University" };
}

export function PageHeaderTitle({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const { title, subtitle } = getTitle(pathname, role);

  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <h2 className="font-serif text-lg font-semibold whitespace-nowrap text-gray-900">{title}</h2>
      {subtitle && (
        <span className="truncate text-[12.5px] text-gray-400">{subtitle}</span>
      )}
    </div>
  );
}
