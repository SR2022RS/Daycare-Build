"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { CredentialType, WriteUpSeverity } from "@/types/database.types";

export async function createWriteUp(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const staffId = formData.get("staffId");
  const reason = formData.get("reason");
  const notes = formData.get("notes");
  const severity = formData.get("severity");

  if (typeof staffId !== "string" || typeof reason !== "string" || !reason.trim()) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("write_ups").insert({
    tenant_id: session.profile.tenantId,
    staff_id: staffId,
    issued_by: session.profile.id,
    reason: reason.trim(),
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    severity: (typeof severity === "string" ? severity : "minor") as WriteUpSeverity,
  });

  revalidatePath(`/staff/${staffId}`);
}

export async function setSiteLead(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const staffId = formData.get("staffId");

  if (typeof staffId !== "string") {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ is_site_lead: formData.get("isSiteLead") === "on" })
    .eq("id", staffId)
    .eq("tenant_id", session.profile.tenantId);

  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/staff");
}

export async function upsertCredential(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const staffId = formData.get("staffId");
  const credentialType = formData.get("credentialType");
  const dateSubmitted = formData.get("dateSubmitted");
  const dateCleared = formData.get("dateCleared");

  if (typeof staffId !== "string" || typeof credentialType !== "string") {
    return;
  }

  const supabase = await createClient();
  await supabase.from("staff_credentials").upsert(
    {
      tenant_id: session.profile.tenantId,
      staff_id: staffId,
      credential_type: credentialType as CredentialType,
      date_submitted: typeof dateSubmitted === "string" && dateSubmitted ? dateSubmitted : null,
      date_cleared: typeof dateCleared === "string" && dateCleared ? dateCleared : null,
    },
    { onConflict: "staff_id,credential_type" },
  );

  revalidatePath(`/staff/${staffId}`);
}
