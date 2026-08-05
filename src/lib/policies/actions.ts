"use server";

import { revalidatePath } from "next/cache";

import { requireRole, verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export async function createPolicy(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const title = formData.get("title");
  const category = formData.get("category");
  const fileUrl = formData.get("fileUrl");

  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof category !== "string" ||
    !category.trim() ||
    typeof fileUrl !== "string" ||
    !fileUrl.trim()
  ) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("policies").insert({
    tenant_id: session.profile.tenantId,
    title: title.trim(),
    category: category.trim(),
    file_url: fileUrl.trim(),
  });

  revalidatePath("/policies");
}

export async function acknowledgePolicy(formData: FormData) {
  const session = await verifySession();
  const policyId = formData.get("policyId");

  if (typeof policyId !== "string" || !policyId) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("policy_acknowledgments").insert({
    tenant_id: session.profile.tenantId,
    policy_id: policyId,
    staff_id: session.profile.id,
  });

  revalidatePath("/policies");
}
