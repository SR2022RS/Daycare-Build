"use server";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export async function updateMyProfile(formData: FormData) {
  const session = await verifySession();
  const phone = formData.get("phone");

  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ phone: typeof phone === "string" && phone.trim() ? phone.trim() : null })
    .eq("id", session.profile.id);

  revalidatePath("/profile");
}
