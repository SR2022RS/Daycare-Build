"use client";

import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { SidebarBrandMark } from "@/components/brand/sidebar-brand-mark";
import { NavList } from "@/components/layout/nav-list";
import { PageHeaderTitle } from "@/components/layout/page-header-title";
import { UserMenu } from "@/components/layout/user-menu";
import { getNavSections } from "@/lib/nav/nav-items";
import type { AppRole } from "@/types/database.types";

interface SidebarShellProps {
  logoUrl: string | null;
  topSlot?: ReactNode;
  fullName: string;
  role: AppRole;
  children: ReactNode;
}

export function SidebarShell({ logoUrl, topSlot, fullName, role, children }: SidebarShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Computed client-side, not passed as a prop: NavItem.icon holds a component
  // reference (lucide-react), which can't cross the Server->Client prop
  // boundary -- React RSC only serializes plain data across that boundary.
  const navSections = getNavSections(role);

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-60 flex-col bg-[var(--brand-ink)] transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative">
          <SidebarBrandMark logoUrl={logoUrl} />
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute top-3 right-3 text-white/70 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {topSlot}

        <NavList sections={navSections} onNavigate={() => setSidebarOpen(false)} />

        <UserMenu fullName={fullName} role={role} />
      </aside>

      <div className="flex flex-1 flex-col md:ml-60">
        <header className="sticky top-0 z-20 flex h-14 items-center border-b border-gray-200 bg-white px-4 shadow-sm md:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="mr-3 text-gray-900 md:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
          <PageHeaderTitle role={role} />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
