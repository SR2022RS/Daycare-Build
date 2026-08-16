import { INTENSIVE, buildIcs } from "@/lib/intensive/config";
import { REMINDER_STAGES, daysUntilEvent, reminderHtml, stageDueToday } from "@/lib/intensive/reminders";
import { sendEmail } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily reminder run for the intensive.
 *
 * Invoked by the Vercel cron declared in vercel.json. Sends at most one
 * stage per day (see REMINDER_STAGES) to every paid registration that has
 * not already had that stage.
 *
 * Safe to run repeatedly: the unique index on
 * (registration_id, stage) means a second run the same day inserts nothing
 * and sends nothing. The row is written BEFORE the email so a crash
 * mid-batch can never double-send -- the cost of that ordering is a
 * possible missed email, which is far better than mailing a buyer twice.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  // Vercel cron sends `Authorization: Bearer $CRON_SECRET`. Without this the
  // route is a public endpoint that anyone could use to blast every buyer.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[intensive-reminders] CRON_SECRET not set");
    return new Response("Not configured", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const remaining = daysUntilEvent();
  const stage = stageDueToday();

  if (!stage) {
    return Response.json({
      ran: true,
      daysUntilEvent: remaining,
      stage: null,
      note: `No reminder scheduled at ${remaining} days out. Stages: ${REMINDER_STAGES.map((s) => `${s.id}@${s.daysBefore}d`).join(", ")}`,
    });
  }

  const admin = createAdminClient();

  const { data: paid, error: readError } = await admin
    .from("intensive_registrations")
    .select("id, first_name, email")
    .eq("tenant_id", INTENSIVE.tenantId)
    .eq("status", "paid");

  if (readError) {
    console.error("[intensive-reminders] read failed", readError);
    return new Response("Read failed", { status: 500 });
  }

  const { data: alreadySent } = await admin
    .from("intensive_reminder_sends")
    .select("registration_id")
    .eq("stage", stage.id);

  const done = new Set((alreadySent ?? []).map((r) => r.registration_id));
  const pending = (paid ?? []).filter((r) => !done.has(r.id));

  let sent = 0;
  const failed: string[] = [];

  for (const registration of pending) {
    // Claim first. If this conflicts, another run already has this one.
    const { error: claimError } = await admin
      .from("intensive_reminder_sends")
      .insert({ registration_id: registration.id, stage: stage.id });

    if (claimError) continue;

    const result = await sendEmail({
      to: registration.email,
      from: INTENSIVE.fromEmail,
      replyTo: INTENSIVE.contactEmail,
      subject: stage.subject,
      html: reminderHtml(stage, registration.first_name),
      ...(stage.attachCalendar
        ? {
            attachments: [
              {
                filename: "daycare-owner-intensive.ics",
                content: buildIcs(),
                contentType: "text/calendar; charset=utf-8; method=PUBLISH",
              },
            ],
          }
        : {}),
    });

    if (result.ok) {
      sent += 1;
    } else {
      // Release the claim so tomorrow's run retries this one, rather than
      // leaving a buyer silently un-reminded because of a transient outage.
      failed.push(registration.email);
      await admin
        .from("intensive_reminder_sends")
        .delete()
        .eq("registration_id", registration.id)
        .eq("stage", stage.id);
      console.error(`[intensive-reminders] send failed for ${registration.email}: ${result.error}`);
    }
  }

  console.log(`[intensive-reminders] stage=${stage.id} sent=${sent} failed=${failed.length}`);

  return Response.json({
    ran: true,
    daysUntilEvent: remaining,
    stage: stage.id,
    eligible: pending.length,
    sent,
    failed: failed.length,
  });
}
