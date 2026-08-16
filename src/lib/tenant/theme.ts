import type { CSSProperties } from "react";

export interface TenantBrand {
  primaryColor: string;
  accentColor: string;
}

/**
 * Maps a tenant's stored brand colors onto the CSS custom properties defined
 * in globals.css. Apply via `style={tenantThemeStyle(tenant)}` on a wrapper
 * element -- this is what makes the shell white-label instead of hardcoded.
 *
 * Only ever writes --brand-*. The --signal-* tokens carry meaning rather than
 * identity: a tenant may rebrand to any palette, but "this credential expired"
 * must still read as urgent. Do not add them here.
 */
export function tenantThemeStyle(tenant: TenantBrand): CSSProperties {
  return {
    "--brand-primary": tenant.primaryColor,
    "--brand-accent": tenant.accentColor,
  } as CSSProperties;
}
