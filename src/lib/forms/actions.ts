"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFormKey, formTitle } from "@/lib/forms/definitions";
import { getClientIp, isRateLimited, logAccess } from "@/lib/forms/access-log";
import { getSiteUrl } from "@/lib/site-url";
import { sendEmail } from "@/lib/email/resend";

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function createFormSend(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const childId = str(formData, "childId");
  const guardianId = str(formData, "guardianId");
  const formKeys = formData.getAll("formKeys").filter((v): v is string => typeof v === "string" && isFormKey(v));

  if (!childId || !guardianId || formKeys.length === 0) {
    return;
  }

  const supabase = await createClient();
  const { data: send } = await supabase
    .from("form_sends")
    .insert({
      tenant_id: session.profile.tenantId,
      child_id: childId,
      guardian_id: guardianId,
      form_keys: formKeys,
      sent_by: session.profile.id,
    })
    .select("token")
    .single();

  // Best-effort -- the link is already visible on the child page regardless
  // of whether this succeeds (e.g. no verified sending domain yet). Never
  // let an email failure block the send itself.
  if (send) {
    const [{ data: guardian }, { data: child }] = await Promise.all([
      supabase.from("guardians").select("full_name, email").eq("id", guardianId).single(),
      supabase.from("children").select("full_name").eq("id", childId).single(),
    ]);

    if (guardian?.email) {
      const link = `${getSiteUrl()}/forms/fill/${send.token}`;
      const formList = formKeys.map((k) => `<li>${formTitle(k)}</li>`).join("");
      await sendEmail({
        to: guardian.email,
        subject: `Forms to complete for ${child?.full_name ?? "your child"} — ${session.tenant.name}`,
        html: `
          <p>Hi ${guardian.full_name ?? "there"},</p>
          <p>${session.tenant.name} has sent you the following form${formKeys.length > 1 ? "s" : ""} to fill out for ${child?.full_name ?? "your child"}:</p>
          <ul>${formList}</ul>
          <p><a href="${link}">Click here to fill them out</a> — no account needed, takes a few minutes.</p>
        `,
      });
    }
  }

  revalidatePath(`/children/${childId}`);
}

// Public, unauthenticated path -- there is no Supabase auth session for a
// parent filling this out, so authorization comes entirely from validating
// the token server-side before touching data (same trust model as a
// password-reset link). Writes go through the admin client, which bypasses
// RLS by design -- see the migration comment on child_form_submissions.
export async function submitChildForm(formData: FormData) {
  const token = str(formData, "token");
  const formKey = str(formData, "formKey");
  const submittedByName = str(formData, "submittedByName");

  if (!token || !formKey || !isFormKey(formKey)) {
    return;
  }

  const ip = await getClientIp();
  if (await isRateLimited(ip)) {
    return;
  }

  const admin = createAdminClient();
  const { data: send } = await admin
    .from("form_sends")
    .select("id, tenant_id, child_id, form_keys, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!send) {
    await logAccess(token, ip, "not_found");
    return;
  }

  const isExpired = send.status === "expired" || send.status === "completed" || new Date(send.expires_at) < new Date();
  if (isExpired || !send.form_keys.includes(formKey)) {
    await logAccess(token, ip, "expired");
    return;
  }

  // Repeated keys (checkbox groups like attendDays) must collect into an
  // array -- a plain object assignment would silently keep only the last
  // checked value.
  const controlFields = new Set(["token", "formKey", "submittedByName"]);
  const data: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const [key, value] of formData.entries()) {
    if (controlFields.has(key) || key.startsWith("$ACTION_")) continue;
    const existing = data[key];
    if (existing === undefined) {
      data[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      data[key] = [existing, value];
    }
  }

  await admin.from("child_form_submissions").insert({
    tenant_id: send.tenant_id,
    child_id: send.child_id,
    send_id: send.id,
    form_key: formKey,
    data,
    submitted_by_name: submittedByName,
  });

  await logAccess(token, ip, "submitted");

  const { data: submissions } = await admin
    .from("child_form_submissions")
    .select("form_key")
    .eq("send_id", send.id);

  const submittedKeys = new Set((submissions ?? []).map((s) => s.form_key));
  if (send.form_keys.every((key) => submittedKeys.has(key))) {
    await admin
      .from("form_sends")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", send.id);
  }

  revalidatePath(`/forms/fill/${token}`);
}
