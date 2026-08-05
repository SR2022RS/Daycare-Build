"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { SopAudience } from "@/types/database.types";

export async function createSop(formData: FormData) {
  const session = await requireRole(["director", "platform_admin"]);
  const title = formData.get("title");
  const category = formData.get("category");
  const audience = formData.get("audience");
  const content = formData.get("content");

  if (typeof title !== "string" || !title.trim() || typeof category !== "string" || !category.trim()) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("sops").insert({
    tenant_id: session.profile.tenantId,
    title: title.trim(),
    category: category.trim(),
    audience: (typeof audience === "string" ? audience : "all") as SopAudience,
    content: typeof content === "string" && content.trim() ? content.trim() : null,
  });

  revalidatePath("/sops");
}
