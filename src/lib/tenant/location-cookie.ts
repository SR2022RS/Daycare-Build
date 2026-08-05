import "server-only";

import { cookies } from "next/headers";

const ACTIVE_LOCATION_COOKIE = "akpa_active_location";

export async function getActiveLocationId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_LOCATION_COOKIE)?.value ?? null;
}

export async function setActiveLocationCookie(locationId: string | null) {
  const cookieStore = await cookies();
  if (!locationId) {
    cookieStore.delete(ACTIVE_LOCATION_COOKIE);
    return;
  }
  cookieStore.set(ACTIVE_LOCATION_COOKIE, locationId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
