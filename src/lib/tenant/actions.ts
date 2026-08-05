"use server";

import { revalidatePath } from "next/cache";

import { setActiveLocationCookie } from "@/lib/tenant/location-cookie";

export async function setActiveLocation(formData: FormData) {
  const locationId = formData.get("locationId");
  await setActiveLocationCookie(typeof locationId === "string" && locationId !== "all" ? locationId : null);
  revalidatePath("/", "layout");
}
