import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getAttachmentUrl, replyToTicket, updateTicketStatus } from "@/lib/support/actions";
import { PriorityPill, StatusPill } from "@/components/support/badges";
import { ALL_STATUSES, CATEGORY_LABELS, STATUS_LABELS } from "@/lib/support/definitions";

export default async function TicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const session = await verifySession();
  const supabase = await createClient();
  const isManager = session.profile.role === "director" || session.profile.role === "platform_admin";

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select(
      "id, subject, description, category, priority, status, created_at, created_by, reporter:profiles!support_tickets_created_by_fkey(full_name)",
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) {
    notFound();
  }

  const reporter = Array.isArray(ticket.reporter) ? ticket.reporter[0] : ticket.reporter;

  const [{ data: messages }, { data: attachments }] = await Promise.all([
    supabase
      .from("support_ticket_messages")
      .select("id, body, created_at, author_id, author:profiles!support_ticket_messages_author_id_fkey(full_name)")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    supabase
      .from("support_ticket_attachments")
      .select("id, file_path, file_name")
      .eq("ticket_id", ticketId),
  ]);

  const attachmentLinks = await Promise.all(
    (attachments ?? []).map(async (a) => ({ ...a, url: await getAttachmentUrl(a.file_path) })),
  );

  return (
    <div className="max-w-[820px]">
      <Link
        href="/support"
        className="mb-3.5 inline-block text-[12.5px] font-semibold text-gray-500 hover:text-[var(--brand-primary)]"
      >
        &larr; Support
      </Link>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-lg font-semibold text-gray-900">{ticket.subject}</h1>
            <PriorityPill priority={ticket.priority} />
            <StatusPill status={ticket.status} />
          </div>
          <p className="mt-1 text-[11.5px] text-gray-400">
            {CATEGORY_LABELS[ticket.category]} &middot; filed by {reporter?.full_name ?? "Unknown"} &middot;{" "}
            {ticket.created_at.slice(0, 10)}
          </p>
        </div>

        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <p className="whitespace-pre-wrap text-[13.5px] text-gray-700">{ticket.description}</p>
        </div>

        {attachmentLinks.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-gray-100 px-4.5 py-3">
            {attachmentLinks.map((a) =>
              a.url ? (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-gray-300"
                >
                  <Paperclip className="h-3 w-3" /> {a.file_name}
                </a>
              ) : null,
            )}
          </div>
        )}

        <ul className="divide-y divide-gray-100">
          {(messages ?? []).map((m) => {
            const author = Array.isArray(m.author) ? m.author[0] : m.author;
            return (
              <li key={m.id} className="px-4.5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-gray-900">{author?.full_name ?? "Unknown"}</span>
                  <span className="text-[11px] text-gray-400">{m.created_at.slice(0, 16).replace("T", " ")}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-gray-700">{m.body}</p>
              </li>
            );
          })}
          {(messages ?? []).length === 0 && (
            <li className="px-4.5 py-6 text-center text-sm text-gray-500">No replies yet.</li>
          )}
        </ul>

        <form action={replyToTicket} className="flex flex-col gap-2 border-t border-gray-100 px-4.5 py-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <textarea
            name="body"
            placeholder="Write a reply…"
            rows={3}
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <button
            type="submit"
            className="self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
          >
            Reply
          </button>
        </form>

        {isManager && (
          <form
            action={updateTicketStatus}
            className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-4.5 py-3"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />
            <label className="text-xs text-gray-500">Status</label>
            <select
              name="status"
              defaultValue={ticket.status}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-[var(--brand-accent)] focus:outline-none"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              Update
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
