import { notFound } from "next/navigation";

import { PrintButton } from "@/components/certificates/print-button";
import { verifySession } from "@/lib/auth/dal";
import { loadUniformWarnings } from "@/lib/uniforms/queries";
import { createClient } from "@/lib/supabase/server";

export default async function WrittenWarningNotice({ params }: { params: Promise<{ warningId: string }> }) {
  const { warningId } = await params;
  const session = await verifySession();
  const supabase = await createClient();
  const list = await loadUniformWarnings(supabase, session.profile.tenantId);
  const warning = list.ok ? list.rows.find((row) => row.id === warningId) : undefined;
  if (!warning || warning.step !== "written") notFound();

  return (
    <main className="mx-auto max-w-[640px] bg-white px-8 py-10 text-gray-900 print:px-0">
      <p className="text-[12px] font-semibold tracking-[.14em] text-gray-500 uppercase">{session.tenant.name}</p>
      <h1 className="mt-2 font-serif text-2xl font-semibold">Written warning — out of uniform</h1>
      <p className="mt-3 text-[14px] leading-relaxed">
        This is the second out-of-uniform offense in the current count period. A third offense is a $10 fee,
        recorded as fee due. This notice does not charge the family and is not sent anywhere.
      </p>
      <dl className="mt-6 flex flex-col gap-3 text-[14px]">
        <div>
          <dt className="text-[11px] font-semibold tracking-[.06em] text-gray-400 uppercase">Child</dt>
          <dd>{warning.childName}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[.06em] text-gray-400 uppercase">Campus</dt>
          <dd>{warning.locationName}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[.06em] text-gray-400 uppercase">Date</dt>
          <dd>{warning.occurredOn}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[.06em] text-gray-400 uppercase">What was missing</dt>
          <dd>{warning.missingItem}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[.06em] text-gray-400 uppercase">Note</dt>
          <dd>{warning.note?.trim() || "None"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[.06em] text-gray-400 uppercase">Logged by</dt>
          <dd>{warning.filedByName}</dd>
        </div>
      </dl>
      <div className="mt-10 grid grid-cols-2 gap-8 text-[13px]">
        <p className="border-t border-gray-400 pt-2">Parent signature / date</p>
        <p className="border-t border-gray-400 pt-2">Staff signature / date</p>
      </div>
      <div className="mt-8 print:hidden">
        <PrintButton />
      </div>
    </main>
  );
}
