import { INTENSIVE } from "@/lib/intensive/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { TourForm, type TourCampus } from "@/components/tours/tour-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule a tour" };

export default async function ScheduleTourPage() {
  const campuses = await loadOpenCampuses();

  return (
    <main className="min-h-screen bg-[#F7F4EF] px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-[560px]">
        <p className="text-[12px] font-semibold tracking-[.14em] text-[#6E1F2E] uppercase">
          Amazin Kids Paradise Academy
        </p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold">Schedule a tour</h1>
        <p className="mt-2 mb-6 text-[14px] leading-relaxed text-gray-600">
          Tell us a little about your child and which Paterson campus you want to see. We will call
          you to set the time.
        </p>
        <TourForm campuses={campuses} />
      </div>
    </main>
  );
}

async function loadOpenCampuses(): Promise<TourCampus[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("locations")
      .select("id, name, address")
      .eq("tenant_id", INTENSIVE.tenantId)
      .eq("is_active", true)
      .order("name");
    if (error) {
      console.error("[tours] campuses failed", error.message);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error("[tours] campuses unavailable", error);
    return [];
  }
}
