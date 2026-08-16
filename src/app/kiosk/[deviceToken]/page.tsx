import { createAdminClient } from "@/lib/supabase/admin";
import { tenantThemeStyle } from "@/lib/tenant/theme";
import { KioskClient } from "@/components/kiosk/kiosk-client";

// Public, unauthenticated route -- a tablet sitting in the lobby, opened
// once and left running. Authorization is the device_token in the URL
// (registered by a director, see /settings) plus the staff PIN entered on
// the pad; there is no login here at all, ever -- see the kiosk_access
// migration for why PIN access is scoped to this device-only flow instead
// of a real session.
export default async function KioskPage({ params }: { params: Promise<{ deviceToken: string }> }) {
  const { deviceToken } = await params;
  const admin = createAdminClient();

  const { data: device } = await admin
    .from("kiosk_devices")
    .select("id, is_active, locations(name), tenants(name, primary_color, accent_color)")
    .eq("device_token", deviceToken)
    .maybeSingle();

  if (!device || !device.is_active) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0D0D10] px-4 py-10 text-center">
        <div className="max-w-[380px] rounded-2xl border border-white/10 bg-[#17171C] p-8">
          <h1 className="font-serif text-lg font-semibold text-[#F5F3EE]">This kiosk isn&apos;t set up</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[#8C857C]">
            Contact your director to register this device.
          </p>
        </div>
      </div>
    );
  }

  const tenant = Array.isArray(device.tenants) ? device.tenants[0] : device.tenants;
  const location = Array.isArray(device.locations) ? device.locations[0] : device.locations;

  return (
    <div style={tenant ? tenantThemeStyle({ primaryColor: tenant.primary_color, accentColor: tenant.accent_color }) : undefined}>
      <KioskClient deviceToken={deviceToken} locationName={location?.name ?? ""} tenantName={tenant?.name ?? ""} />
    </div>
  );
}
