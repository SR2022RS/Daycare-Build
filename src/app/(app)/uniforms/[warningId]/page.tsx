import Link from "next/link";
import { notFound } from "next/navigation";

import { verifySession } from "@/lib/auth/dal";
import { loadUniformWarnings } from "@/lib/uniforms/queries";
import { STEP_LABELS } from "@/lib/uniforms/steps";
import { createClient } from "@/lib/supabase/server";

export default async function UniformWarningPage({ params }: { params: Promise<{ warningId: string }> }) {
  const { warningId } = await params;
  const session = await verifySession();
  const supabase = await createClient();
  const list = await loadUniformWarnings(supabase, session.profile.tenantId);
  const warning = list.ok ? list.rows.find((row) => row.id === warningId) : undefined;
  if (!warning) notFound();

  const rows: { label: string; value: string }[] = [
    { label: "Date", value: warning.occurredOn },
    { label: "Campus", value: warning.locationName },
    { label: "What was missing", value: warning.missingItem },
    { label: "Note", value: warning.note?.trim() || "None" },
    { label: "Staff", value: warning.filedByName },
    { label: "Step", value: warning.feeDue ? "Fee due — $10" : STEP_LABELS[warning.step] },
  ];

  return (
    <div className="max-w-[720px]">
      <Link
        href="/uniforms"
        className="mb-3.5 inline-block text-[12.5px] font-semibold text-gray-500 hover:text-[var(--brand-primary)]"
      >
        &larr; Uniform log
      </Link>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h1 className="font-serif text-[16px] font-semibold text-gray-900">{warning.childName}</h1>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            <Link href={`/children/${warning.childId}`} className="font-semibold text-[var(--brand-primary)]">
              Child profile
            </Link>
          </p>
        </div>
        <div className="flex flex-col gap-3 px-4.5 py-4">
          {warning.feeDue && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-900">
              Fee due — $10. This is a record only. It is not added to billing and nothing is sent.
            </p>
          )}
          <dl className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <div key={row.label}>
                <dt className="text-[11px] font-semibold tracking-[.06em] text-gray-400 uppercase">{row.label}</dt>
                <dd className="mt-0.5 text-[13px] whitespace-pre-wrap text-gray-800">{row.value}</dd>
              </div>
            ))}
          </dl>
          {warning.step === "written" && (
            <Link
              href={`/uniform-notices/${warning.id}`}
              className="self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
            >
              Print written warning
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
