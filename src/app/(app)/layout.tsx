import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getActiveLocationId } from "@/lib/tenant/location-cookie";
import { tenantThemeStyle } from "@/lib/tenant/theme";
import { SidebarShell } from "@/components/layout/sidebar-shell";
import { LocationSwitcher } from "@/components/layout/location-switcher";

interface LocationOption {
  id: string;
  name: string;
}

async function getLocationOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  staffId: string,
  canSeeAllLocations: boolean,
): Promise<LocationOption[]> {
  if (canSeeAllLocations) {
    const { data } = await supabase
      .from("locations")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("name");
    return data ?? [];
  }

  const { data } = await supabase
    .from("staff_locations")
    .select("locations(id, name)")
    .eq("staff_id", staffId);

  return (data ?? [])
    .map((row) => row.locations)
    .filter((loc): loc is LocationOption => Boolean(loc));
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  const supabase = await createClient();
  const canSeeAllLocations = session.profile.role !== "staff";

  const locationList = await getLocationOptions(
    supabase,
    session.profile.tenantId,
    session.profile.id,
    canSeeAllLocations,
  );
  const activeLocationId = await getActiveLocationId();

  return (
    <div style={tenantThemeStyle(session.tenant)}>
      <SidebarShell
        logoUrl={session.tenant.logoUrl}
        topSlot={
          <LocationSwitcher
            locations={locationList}
            activeLocationId={activeLocationId}
            canSeeAllLocations={canSeeAllLocations}
          />
        }
        fullName={session.profile.fullName}
        role={session.profile.role}
      >
        {children}
      </SidebarShell>
    </div>
  );
}
