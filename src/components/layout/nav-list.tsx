"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavSection } from "@/types/nav";

export function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-6 px-3 py-4">
      {sections.map((section, i) => (
        <div key={section.label ?? i}>
          {section.label && (
            <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
              {section.label}
            </div>
          )}
          <ul className="space-y-1">
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-md border-l-[3px] px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-[var(--brand-accent)] bg-white/10 text-[var(--brand-accent)]"
                        : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
