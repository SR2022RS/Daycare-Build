import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The card shell every screen in this app already draws by hand.
 *
 * These class strings were duplicated across children, billing, waitlist,
 * support and the dashboard; they are lifted here verbatim so the dashboard
 * redesign matches the rest of the portal exactly rather than approximately.
 * Existing screens can adopt these incrementally -- nothing is forced.
 */

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${className}`}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  /** Count badge, filter, or anything that belongs opposite the title. */
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4.5 py-3.5">
      <div className="min-w-0">
        <h3 className="font-serif text-[14.5px] font-semibold text-gray-900">{title}</h3>
        {subtitle && <div className="mt-0.5 text-[11.5px] text-gray-400">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

/**
 * Most of this dashboard's panels are empty most of the time -- no one on the
 * clock, nothing expiring, nobody overdue. Empty is the common case, so it
 * gets a real message rather than a blank box.
 */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <div className="px-4.5 py-6 text-center text-sm text-gray-500">{children}</div>;
}

export function PanelFooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="block border-t border-gray-100 px-4.5 py-3 text-[12.5px] font-semibold text-[var(--brand-primary)] hover:opacity-80"
    >
      {children}
    </Link>
  );
}
