import {
  BookOpen,
  Calendar,
  LayoutDashboard,
  Settings,
  Users,
  FileText,
  Baby,
  UserCircle,
  ShieldAlert,
  BookMarked,
  LifeBuoy,
  Receipt,
} from "lucide-react";

import type { AppRole } from "@/types/database.types";
import type { NavSection } from "@/types/nav";

export function getNavSections(role: AppRole): NavSection[] {
  if (role === "director" || role === "platform_admin") {
    return [
      { label: "Overview", items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
      {
        label: "People",
        items: [
          { title: "Staff directory", href: "/staff", icon: Users },
          { title: "Attendance", href: "/attendance", icon: Calendar },
        ],
      },
      {
        label: "Children",
        items: [{ title: "Children & guardians", href: "/children", icon: Baby }],
      },
      {
        label: "Billing",
        items: [
          { title: "Invoices", href: "/billing", icon: Receipt },
          { title: "Revenue", href: "/billing/revenue", icon: LayoutDashboard },
        ],
      },
      {
        label: "Safety",
        items: [{ title: "Incident reports", href: "/incidents", icon: ShieldAlert }],
      },
      {
        label: "Learning",
        items: [
          { title: "Coursework", href: "/training", icon: BookOpen },
          { title: "Policies library", href: "/policies", icon: FileText },
          { title: "SOPs", href: "/sops", icon: BookMarked },
        ],
      },
      {
        label: "System",
        items: [
          { title: "My profile", href: "/profile", icon: UserCircle },
          { title: "Get Help", href: "/support", icon: LifeBuoy },
          { title: "Settings", href: "/settings", icon: Settings },
        ],
      },
    ];
  }

  return [
    { label: "Overview", items: [{ title: "My day", href: "/dashboard", icon: LayoutDashboard }] },
    {
      label: "My work",
      items: [
        { title: "My coursework", href: "/training", icon: BookOpen },
        { title: "Time clock", href: "/attendance", icon: Calendar },
        { title: "Incident reports", href: "/incidents", icon: ShieldAlert },
        { title: "Children", href: "/children", icon: Baby },
      ],
    },
    {
      label: "Library",
      items: [
        { title: "Policies library", href: "/policies", icon: FileText },
        { title: "SOPs", href: "/sops", icon: BookMarked },
        { title: "My profile", href: "/profile", icon: UserCircle },
        { title: "Get Help", href: "/support", icon: LifeBuoy },
      ],
    },
  ];
}
