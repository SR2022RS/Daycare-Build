import { verifySession } from "@/lib/auth/dal";
import { loadUniformSettings, loadUniformWarnings } from "@/lib/uniforms/queries";
import { campusToday, dressForDate, RESET_LABELS } from "@/lib/uniforms/steps";
import { createClient } from "@/lib/supabase/server";
import { FileUniformForm, type UniformChildOption } from "@/components/uniforms/file-uniform-form";
import { ResetSettingsForm } from "@/components/uniforms/reset-settings-form";
import { UniformList } from "@/components/uniforms/uniform-list";

export const metadata = { title: "Out of uniform" };

export default async function UniformsPage() {
  const session = await verifySession();
  const supabase = await createClient();
  const tenantId = session.profile.tenantId;
  const isDirector = session.profile.role !== "staff";
  const today = campusToday();
  const dress = dressForDate(today);

  const [list, settings, locationsResult, childrenResult, assignments] = await Promise.all([
    loadUniformWarnings(supabase, tenantId),
    loadUniformSettings(supabase, tenantId),
    supabase.from("locations").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
    supabase.from("child_people").select("child_id, full_name, location_id").eq("tenant_id", tenantId).order("full_name"),
    isDirector
      ? Promise.resolve({ data: null })
      : supabase.from("staff_locations").select("location_id").eq("staff_id", session.profile.id),
  ]);

  const allLocations = locationsResult.data ?? [];
  const assigned = new Set((assignments.data ?? []).map((row) => row.location_id));
  const locations = isDirector ? allLocations : allLocations.filter((location) => assigned.has(location.id));
  const enrolled: UniformChildOption[] = (childrenResult.data ?? [])
    .filter((child) => child.location_id)
    .map((child) => ({
      id: child.child_id,
      fullName: child.full_name,
      locationId: child.location_id as string,
    }));

  const rows = list.ok ? list.rows : [];
  const campuses = [...new Set(rows.map((row) => row.locationName))].sort();

  return (
    <div className="max-w-[900px]">
      <p className="mb-3 text-[13px] text-gray-600">
        Today is <span className="font-semibold text-gray-900">{dress.title}</span>. {dress.detail} Monday through
        Wednesday is the uniform, Thursday is a sweatsuit, and Friday is a $3 tag day. A missing piece is logged here:
        1st verbal, 2nd written, 3rd a $10 fee due. The count resets {RESET_LABELS[settings.resetMode].toLowerCase()}.
      </p>
      {!list.ok && (
        <p className="mb-3 rounded-md bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
          Uniform warnings could not be loaded.
        </p>
      )}
      <UniformList rows={rows} campuses={campuses} />

      <details className="group mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4.5 py-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50">
          + Log an out-of-uniform warning
        </summary>
        <FileUniformForm
          locations={locations}
          enrolled={enrolled}
          prior={rows.map((row) => ({ childId: row.childId, occurredOn: row.occurredOn }))}
          resetMode={settings.resetMode}
          startMonth={settings.startMonth}
          startDay={settings.startDay}
          today={today}
        />
      </details>

      {isDirector && (
        <ResetSettingsForm
          resetMode={settings.resetMode}
          startMonth={settings.startMonth}
          startDay={settings.startDay}
        />
      )}
    </div>
  );
}
