import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { tenantThemeStyle } from "@/lib/tenant/theme";
import { formTitle } from "@/lib/forms/definitions";
import { getClientIp, isRateLimited, logAccess } from "@/lib/forms/access-log";
import { LinkUnavailable } from "@/components/forms/link-unavailable";
import { ChildEnrollmentForm } from "@/components/forms/child-enrollment-form";
import { EmergencyContactsForm } from "@/components/forms/emergency-contacts-form";
import { PickupAuthorizationForm } from "@/components/forms/pickup-authorization-form";

export default async function FillFormsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = await getClientIp();

  // Rate limit check happens before touching form_sends at all -- a
  // brute-force guesser gets the same generic page with zero DB lookups
  // once they trip the threshold.
  if (await isRateLimited(ip)) {
    return <LinkUnavailable />;
  }

  const admin = createAdminClient();

  // Only the columns needed to decide validity -- no child/tenant data is
  // fetched until this check passes.
  const { data: send } = await admin
    .from("form_sends")
    .select("id, tenant_id, child_id, form_keys, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!send) {
    await logAccess(token, ip, "not_found");
    return <LinkUnavailable />;
  }

  const isExpired = send.status === "expired" || send.status === "completed" || new Date(send.expires_at) < new Date();

  if (isExpired) {
    await logAccess(token, ip, "expired");
    return <LinkUnavailable />;
  }

  await logAccess(token, ip, "viewed");

  // Only reached for a valid, active, unexpired token.
  const [{ data: tenant }, { data: child }, { data: submissions }] = await Promise.all([
    admin.from("tenants").select("name, logo_url, primary_color, accent_color").eq("id", send.tenant_id).single(),
    admin.from("children").select("full_name").eq("id", send.child_id).single(),
    admin.from("child_form_submissions").select("form_key").eq("send_id", send.id),
  ]);

  const completedKeys = new Set((submissions ?? []).map((s) => s.form_key));

  return (
    <div
      className="min-h-screen bg-gray-50 px-4 py-10"
      style={tenant ? tenantThemeStyle({ primaryColor: tenant.primary_color, accentColor: tenant.accent_color }) : undefined}
    >
      <div className="mx-auto flex max-w-[640px] flex-col gap-6">
        <div className="flex flex-col items-center text-center">
          {tenant?.logo_url && (
            <Image
              src={tenant.logo_url}
              alt={tenant.name}
              width={160}
              height={70}
              priority
              className="mb-3 h-auto w-[140px]"
            />
          )}
          <h1 className="font-serif text-xl font-semibold text-gray-900">
            Forms for {child?.full_name ?? "your child"}
          </h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {tenant?.name} &middot; please fill out the form{send.form_keys.length > 1 ? "s" : ""} below
          </p>
        </div>

        {send.form_keys.map((key) => {
          const isDone = completedKeys.has(key);
          return (
            <div key={key} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <h2 className="font-serif text-[15px] font-semibold text-gray-900">{formTitle(key)}</h2>
                {isDone && (
                  <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] text-green-700 uppercase">
                    <CheckCircle2 className="h-3 w-3" /> Submitted
                  </span>
                )}
              </div>
              <div className="p-5">
                {isDone ? (
                  <p className="text-[13px] text-gray-500">
                    Thank you &mdash; this form has been received. Contact the center if you need to make a
                    correction.
                  </p>
                ) : (
                  <FormBody formKey={key} token={token} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormBody({ formKey, token }: { formKey: string; token: string }) {
  switch (formKey) {
    case "child_enrollment_record":
      return <ChildEnrollmentForm token={token} />;
    case "emergency_contacts":
      return <EmergencyContactsForm token={token} />;
    case "pickup_authorization":
      return <PickupAuthorizationForm token={token} />;
    default:
      return (
        <p className="text-sm text-gray-500">
          Unknown form ({formTitle(formKey)}) &mdash; contact the center for help.
        </p>
      );
  }
}
