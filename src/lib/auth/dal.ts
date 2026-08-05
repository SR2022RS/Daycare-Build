import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database.types";

export interface SessionContext {
  userId: string;
  email: string;
  profile: {
    id: string;
    tenantId: string;
    role: AppRole;
    fullName: string;
    avatarUrl: string | null;
    isSiteLead: boolean;
  };
  tenant: {
    id: string;
    name: string;
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
  };
}

/**
 * Verifies the session against the database (not just the cookie) and
 * returns the profile + tenant needed to render the app shell. Redirects
 * to /login if there is no valid session. Memoized per-request via cache()
 * so calling this from multiple components/layouts doesn't re-query.
 */
export const verifySession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, tenant_id, role, full_name, avatar_url, is_site_lead, tenants(id, name, logo_url, primary_color, accent_color)",
    )
    .eq("id", user.sub)
    .single();

  if (profileError || !profile || !profile.tenants) {
    redirect("/login");
  }

  const tenant = Array.isArray(profile.tenants) ? profile.tenants[0] : profile.tenants;

  return {
    userId: user.sub as string,
    email: user.email as string,
    profile: {
      id: profile.id,
      tenantId: profile.tenant_id,
      role: profile.role,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      isSiteLead: profile.is_site_lead,
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      logoUrl: tenant.logo_url,
      primaryColor: tenant.primary_color,
      accentColor: tenant.accent_color,
    },
  };
});

export async function requireRole(allowed: AppRole[]): Promise<SessionContext> {
  const session = await verifySession();
  if (!allowed.includes(session.profile.role)) {
    redirect("/dashboard");
  }
  return session;
}
