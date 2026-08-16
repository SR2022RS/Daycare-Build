import Link from "next/link";
import { LifeBuoy } from "lucide-react";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { NewTicketForm } from "@/components/support/new-ticket-form";
import { PriorityPill, StatusPill } from "@/components/support/badges";
import {
  ALL_CATEGORIES,
  ALL_PRIORITIES,
  ALL_STATUSES,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "@/lib/support/definitions";
import type { SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from "@/types/database.types";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; priority?: string }>;
}) {
  const session = await verifySession();
  const supabase = await createClient();
  const isManager = session.profile.role === "director" || session.profile.role === "platform_admin";
  const { status, category, priority } = await searchParams;

  const { data: mine } = await supabase
    .from("support_tickets")
    .select("id, subject, category, priority, status, created_at")
    .eq("created_by", session.profile.id)
    .order("created_at", { ascending: false });

  let queue: {
    id: string;
    subject: string;
    category: SupportTicketCategory;
    priority: SupportTicketPriority;
    status: SupportTicketStatus;
    created_at: string;
    creatorName: string;
  }[] = [];

  if (isManager) {
    let query = supabase
      .from("support_tickets")
      .select(
        "id, subject, category, priority, status, created_at, reporter:profiles!support_tickets_created_by_fkey(full_name)",
      )
      .order("created_at", { ascending: false });

    if (status && ALL_STATUSES.includes(status as SupportTicketStatus)) {
      query = query.eq("status", status as SupportTicketStatus);
    }
    if (category && ALL_CATEGORIES.includes(category as SupportTicketCategory)) {
      query = query.eq("category", category as SupportTicketCategory);
    }
    if (priority && ALL_PRIORITIES.includes(priority as SupportTicketPriority)) {
      query = query.eq("priority", priority as SupportTicketPriority);
    }

    const { data } = await query;
    queue = (data ?? []).map((row) => {
      const reporter = Array.isArray(row.reporter) ? row.reporter[0] : row.reporter;
      return { ...row, creatorName: reporter?.full_name ?? "Unknown" };
    });
  }

  return (
    <div className="max-w-[1100px]">
      <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-5 py-3.5">
        <LifeBuoy className="h-4 w-4 text-[var(--brand-primary)]" />
        <span className="text-[13px] text-gray-600">
          Search Policies or SOPs for an answer, or submit a ticket below and the team will follow up.
        </span>
      </div>

      {isManager && (
        <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Support queue</h2>
            <span className="text-[11.5px] text-gray-400">{queue.length} ticket{queue.length === 1 ? "" : "s"}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4.5 py-2.5">
            {(["all", ...ALL_STATUSES] as const).map((s) => (
              <Link
                key={s}
                href={s === "all" ? "/support" : `/support?status=${s}`}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                  (status ?? "all") === s ? "bg-[var(--brand-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]}
              </Link>
            ))}
          </div>

          <form method="get" className="flex flex-wrap items-end gap-2 border-b border-gray-100 px-4.5 py-2.5">
            {status && <input type="hidden" name="status" value={status} />}
            <label className="flex flex-col text-[11px] text-gray-500">
              Category
              <select
                name="category"
                defaultValue={category ?? "all"}
                className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-[var(--brand-accent)] focus:outline-none"
              >
                <option value="all">All categories</option>
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-[11px] text-gray-500">
              Priority
              <select
                name="priority"
                defaultValue={priority ?? "all"}
                className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-[var(--brand-accent)] focus:outline-none"
              >
                <option value="all">All priorities</option>
                {ALL_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Filter
            </button>
          </form>

          <ul className="divide-y divide-gray-100">
            {queue.map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="flex items-center justify-between gap-3 px-4.5 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-gray-900">{t.subject}</p>
                    <p className="truncate text-[11.5px] text-gray-400">
                      {CATEGORY_LABELS[t.category]} &middot; {t.creatorName} &middot; {t.created_at.slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PriorityPill priority={t.priority} />
                    <StatusPill status={t.status} />
                  </div>
                </Link>
              </li>
            ))}
            {queue.length === 0 && (
              <li className="px-4.5 py-6 text-center text-sm text-gray-500">No tickets match this filter.</li>
            )}
          </ul>
        </section>
      )}

      <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Your tickets</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {(mine ?? []).map((t) => (
            <li key={t.id}>
              <Link href={`/support/${t.id}`} className="flex items-center justify-between gap-3 px-4.5 py-3 hover:bg-gray-50">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-gray-900">{t.subject}</p>
                  <p className="truncate text-[11.5px] text-gray-400">
                    {CATEGORY_LABELS[t.category]} &middot; {t.created_at.slice(0, 10)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <PriorityPill priority={t.priority} />
                  <StatusPill status={t.status} />
                </div>
              </Link>
            </li>
          ))}
          {(mine ?? []).length === 0 && (
            <li className="px-4.5 py-6 text-center text-sm text-gray-500">
              Tickets you submit will appear here, along with the team&apos;s reply.
            </li>
          )}
        </ul>
      </section>

      <details className="group max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4.5 py-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50">
          + New ticket
        </summary>
        <div className="border-t border-gray-100 p-4.5">
          <NewTicketForm />
        </div>
      </details>
    </div>
  );
}
