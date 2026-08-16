"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { sendEmail } from "@/lib/email/resend";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, NewTicketSchema, type TicketFormState } from "@/lib/support/definitions";
import type { SupportTicketStatus } from "@/types/database.types";

// Any authenticated user (staff or director) can file a ticket -- RLS
// enforces `created_by = auth.uid()` regardless of what the app sends, so
// there's no separate role gate here (same reasoning as fileIncident()).
export async function createTicket(_state: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const session = await verifySession();

  const validated = NewTicketSchema.safeParse({
    category: formData.get("category"),
    priority: formData.get("priority"),
    subject: formData.get("subject"),
    description: formData.get("description"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({
      tenant_id: session.profile.tenantId,
      created_by: session.profile.id,
      category: validated.data.category,
      priority: validated.data.priority,
      subject: validated.data.subject,
      description: validated.data.description,
    })
    .select("id")
    .single();

  if (error || !ticket) {
    return { message: "Couldn't submit your ticket. Try again." };
  }

  // Attachments are best-effort -- a failed upload never blocks the ticket
  // itself from being filed. Path is {tenant_id}/{ticket_id}/{random}-{name}
  // so Storage RLS (see the support_tickets migration) can authorize on the
  // path alone, and the random prefix avoids same-name collisions.
  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_ATTACHMENTS);

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) continue;

    const path = `${session.profile.tenantId}/${ticket.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("ticket-attachments")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });

    if (uploadError) continue;

    await supabase.from("support_ticket_attachments").insert({
      ticket_id: ticket.id,
      tenant_id: session.profile.tenantId,
      file_path: path,
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: session.profile.id,
    });
  }

  await notifyDirectors(supabase, session, {
    subject: `New support ticket: ${validated.data.subject}`,
    html: `<p>${session.profile.fullName} filed a new ${validated.data.priority} priority ticket.</p><p><a href="${getSiteUrl()}/support/${ticket.id}">View it</a></p>`,
  });

  revalidatePath("/support");
  redirect(`/support/${ticket.id}`);
}

// Either the ticket's creator or a director/platform_admin can reply -- RLS
// is the real gate (see support_ticket_messages_insert), so an unauthorized
// call just inserts zero rows rather than needing an app-layer role check.
export async function replyToTicket(formData: FormData) {
  const session = await verifySession();
  const ticketId = formData.get("ticketId");
  const body = formData.get("body");

  if (typeof ticketId !== "string" || !ticketId || typeof body !== "string" || !body.trim()) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    tenant_id: session.profile.tenantId,
    author_id: session.profile.id,
    body: body.trim(),
  });

  if (error) {
    return;
  }

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("subject, created_by")
    .eq("id", ticketId)
    .single();

  if (ticket) {
    const link = `${getSiteUrl()}/support/${ticketId}`;
    if (session.profile.id === ticket.created_by) {
      await notifyDirectors(supabase, session, {
        subject: `New reply: ${ticket.subject}`,
        html: `<p>${session.profile.fullName} replied to their ticket.</p><p><a href="${link}">View it</a></p>`,
      });
    } else {
      await notifyCreator(supabase, session, ticket.created_by, {
        subject: `New reply: ${ticket.subject}`,
        html: `<p>${session.profile.fullName} replied to your ticket.</p><p><a href="${link}">View it</a></p>`,
      });
    }
  }

  revalidatePath(`/support/${ticketId}`);
}

const STATUS_VALUES: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];

export async function updateTicketStatus(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const ticketId = formData.get("ticketId");
  const status = formData.get("status");

  if (typeof ticketId !== "string" || !ticketId || typeof status !== "string") {
    return;
  }
  if (!STATUS_VALUES.includes(status as SupportTicketStatus)) {
    return;
  }

  const supabase = await createClient();
  const resolvedAt = status === "resolved" || status === "closed" ? new Date().toISOString() : null;

  const { data: ticket } = await supabase
    .from("support_tickets")
    .update({ status: status as SupportTicketStatus, resolved_at: resolvedAt })
    .eq("id", ticketId)
    .eq("tenant_id", session.profile.tenantId)
    .select("subject, created_by")
    .single();

  if (ticket) {
    await notifyCreator(supabase, session, ticket.created_by, {
      subject: `Ticket status updated: ${ticket.subject}`,
      html: `<p>Status is now "${status.replace("_", " ")}".</p><p><a href="${getSiteUrl()}/support/${ticketId}">View ticket</a></p>`,
    });
  }

  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
}

// Short-lived signed URL -- the bucket is private, so this is the only way
// an attachment is ever readable, and only for whoever the caller's own
// session (with Storage RLS applied) is authorized to see.
export async function getAttachmentUrl(filePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("ticket-attachments").createSignedUrl(filePath, 60 * 10);
  if (error || !data) return null;
  return data.signedUrl;
}

type EmailPayload = { subject: string; html: string };

async function notifyDirectors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: Awaited<ReturnType<typeof verifySession>>,
  payload: EmailPayload,
) {
  const { data: directors } = await supabase
    .from("profiles")
    .select("email")
    .eq("tenant_id", session.profile.tenantId)
    .in("role", ["director", "platform_admin"]);

  await Promise.all(
    (directors ?? [])
      .filter((d) => d.email !== session.email)
      .map((d) => sendEmail({ to: d.email, ...payload })),
  );
}

async function notifyCreator(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: Awaited<ReturnType<typeof verifySession>>,
  creatorId: string,
  payload: EmailPayload,
) {
  if (creatorId === session.profile.id) return;

  const { data: creator } = await supabase.from("profiles").select("email").eq("id", creatorId).single();
  if (creator?.email) {
    await sendEmail({ to: creator.email, ...payload });
  }
}
