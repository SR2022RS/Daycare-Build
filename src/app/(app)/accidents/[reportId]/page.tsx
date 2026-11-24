import Link from "next/link";
import { notFound } from "next/navigation";

import { canManageAccident } from "@/lib/accidents/model";
import { loadAccident } from "@/lib/accidents/queries";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { AccidentEditor } from "@/components/accidents/accident-editor";

export default async function AccidentReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const session = await verifySession();
  const supabase = await createClient();
  const tenantId = session.profile.tenantId;

  const report = await loadAccident(supabase, tenantId, reportId);
  if (!report) notFound();

  const canEdit = canManageAccident(session.profile.role, session.profile.isSiteLead);
  const [{ data: locations }, { data: children }] = await Promise.all([
    canEdit
      ? supabase.from("locations").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    canEdit
      ? supabase.from("child_people").select("child_id, full_name, location_id").eq("tenant_id", tenantId).order("full_name")
      : Promise.resolve({ data: [] as { child_id: string; full_name: string; location_id: string | null }[] }),
  ]);

  return (
    <div className="max-w-[720px]">
      <Link
        href="/accidents"
        className="mb-3.5 inline-block text-[12.5px] font-semibold text-gray-500 hover:text-[var(--brand-primary)]"
      >
        &larr; Accident reports
      </Link>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h1 className="font-serif text-[16px] font-semibold text-gray-900">{report.childName}</h1>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            <Link href={`/children/${report.childId}`} className="font-semibold text-[var(--brand-primary)]">
              Child profile
            </Link>
          </p>
        </div>
        <div className="px-4.5 py-4">
          <AccidentEditor
            report={report}
            canEdit={canEdit}
            locations={locations ?? []}
            enrolled={(children ?? [])
              .filter((child) => child.location_id)
              .map((child) => ({
                id: child.child_id,
                fullName: child.full_name,
                locationId: child.location_id as string,
              }))}
          />
        </div>
      </section>
    </div>
  );
}
