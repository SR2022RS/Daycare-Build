import { LogOut } from "lucide-react";

import { logout } from "@/lib/auth/actions";

export function UserMenu({ fullName, role }: { fullName: string; role: string }) {
  const initials = fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="shrink-0 border-t border-white/10 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)]/15 text-xs font-semibold text-[var(--brand-accent)]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{fullName}</p>
          <p className="truncate text-xs capitalize text-white/50">{role}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            title="Sign out"
            className="text-white/50 transition-colors hover:text-[var(--brand-accent)]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
