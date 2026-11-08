import { INTENSIVE, buildIcs } from "@/lib/intensive/config";
import {
  REMINDER_STAGES,
  daysUntilEvent,
  reminderHtml,
  stageDueToday,
} from "@/lib/intensive/reminders";
import { sendEmail } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIntensiveHealthCheck } from "@/lib/intensive/health";
import { alertCopy } from "@/lib/intensive/health-alert";
import { retryUntil } from "@/lib/retry";

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

  // Health first, every run, regardless of whether a reminder is due. Most
  // days this cron has nothing to send, so without this the daily run proves
  // nothing and a broken buy path stays invisible until a customer finds it
  // -- which is exactly how the Stripe key outage was discovered.
  const health = await runIntensiveHealthCheck();
  if (!health.healthy) {
    const broken = health.checks.filter((c) => !c.ok);
    console.error(
      `[intensive-reminders] BUY PATH UNHEALTHY: ${broken.map((c) => `${c.name}: ${c.detail}`).join(" | ")}`,
    );
    if (!INTENSIVE.alertEmail) {
      // Logged above. Not mailing anyone beats mailing the business owner a
      // fault report she cannot act on -- see INTENSIVE.alertEmail.
      console.error(
        "[intensive-reminders] INTENSIVE_ALERT_EMAIL unset; alert not sent",
      );
    } else {
      // Worded by what actually broke: a database hiccup must not claim
      // customers cannot buy -- on the hosted path they pay through GHL.
      const copy = alertCopy(INTENSIVE.name, broken);
      await sendEmail({
        to: INTENSIVE.alertEmail,
        from: INTENSIVE.alertFromEmail,
        subject: copy.subject,
        html:
          `<div style="font-family:system-ui,sans-serif;max-width:560px">` +
          `<h2 style="color:#B42318;margin:0 0 10px;">${copy.headline}</h2>` +
          `<p style="color:#334155;line-height:1.6;">${copy.lead}</p>` +
          `<ul style="color:#334155;line-height:1.7;">` +
          broken
            .map((c) => `<li><strong>${c.name}</strong>: ${c.detail}</li>`)
            .join("") +
          `</ul></div>`,
      }).catch(() => {
        /* An alert that cannot send must not take the reminder run down with it. */
      });
    }
  }

  const remaining = daysUntilEvent();
  const stage = stageDueToday();

  if (!stage) {
    return Response.json({
      ran: true,
      healthy: health.healthy,
      daysUntilEvent: remaining,
      stage: null,
      note: `No reminder scheduled at ${remaining} days out. Stages: ${REMINDER_STAGES.map((s) => `${s.id}@${s.daysBefore}d`).join(", ")}`,
    });
  }

  const admin = createAdminClient();

  // Retried: on Sep 12 this read hit a one-off gateway timeout at 9 AM and
  // the whole run stopped, so the only paid buyer missed her day-of reminder
  // until it was re-run by hand. The claim table below keeps a retry from
  // ever sending twice.
  const { result: paidRead, attempts } = await retryUntil(
    async () =>
      await admin
        .from("intensive_registrations")
        .select("id, first_name, email")
        .eq("tenant_id", INTENSIVE.tenantId)
        .eq("status", "paid")
        // Only this session's buyers. Without it, announcing the next date
        // would email everyone who attended September about a class they have
        // already taken.
        .eq("cohort", INTENSIVE.cohort),
    (response) => Boolean(response.error),
  );
  const { data: paid, error: readError } = paidRead;

  if (readError) {
    console.error(
      `[intensive-reminders] read failed after ${attempts} attempts`,
      readError,
    );
    return new Response("Read failed", { status: 500 });
  }
  if (attempts > 1) {
    console.log(
      `[intensive-reminders] paid list read recovered on attempt ${attempts}`,
    );
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
      console.error(
        `[intensive-reminders] send failed for ${registration.email}: ${result.error}`,
      );
    }
  }

  console.log(
    `[intensive-reminders] stage=${stage.id} sent=${sent} failed=${failed.length}`,
  );

  return Response.json({
    ran: true,
    healthy: health.healthy,
    daysUntilEvent: remaining,
    stage: stage.id,
    eligible: pending.length,
    sent,
    failed: failed.length,
  });
}
