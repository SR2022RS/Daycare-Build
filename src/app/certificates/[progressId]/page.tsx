import Image from "next/image";
import { notFound } from "next/navigation";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/certificates/print-button";

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default async function CertificatePage({ params }: { params: Promise<{ progressId: string }> }) {
  const { progressId } = await params;
  const session = await verifySession();
  const supabase = await createClient();

  const { data: progress } = await supabase
    .from("staff_training_progress")
    .select(
      "id, staff_id, completed_at, quiz_score, profiles(full_name), training_modules(title, category, renewal_months)",
    )
    .eq("id", progressId)
    .eq("status", "completed")
    .maybeSingle();

  if (!progress || !progress.completed_at) {
    notFound();
  }

  const staff = Array.isArray(progress.profiles) ? progress.profiles[0] : progress.profiles;
  const trainingModule = Array.isArray(progress.training_modules)
    ? progress.training_modules[0]
    : progress.training_modules;

  if (!staff || !trainingModule) {
    notFound();
  }

  const completedDate = progress.completed_at.slice(0, 10);
  const expiresAt = trainingModule.renewal_months
    ? addMonths(progress.completed_at, trainingModule.renewal_months)
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-100 px-4 py-10 print:bg-white print:p-0">
      <div className="mb-4 print:hidden">
        <PrintButton />
      </div>

      <div className="w-full max-w-[760px] border-[3px] border-double p-10 text-center shadow-sm print:shadow-none" style={{ borderColor: "var(--brand-primary)", background: "#fff" }}>
        {session.tenant.logoUrl && (
          <Image
            src={session.tenant.logoUrl}
            alt={session.tenant.name}
            width={160}
            height={70}
            className="mx-auto mb-4 h-auto w-[160px]"
          />
        )}
        <p className="text-[11px] font-bold tracking-[.3em] text-gray-400 uppercase">
          {session.tenant.name}
        </p>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-gray-900">Certificate of Completion</h1>
        <p className="mt-6 text-[13px] text-gray-500">This certifies that</p>
        <p className="mt-2 font-serif text-2xl font-semibold" style={{ color: "var(--brand-primary)" }}>
          {staff.full_name}
        </p>
        <p className="mt-4 text-[13px] text-gray-500">has successfully completed</p>
        <p className="mt-2 text-xl font-semibold text-gray-900">{trainingModule.title}</p>
        <p className="mt-1 text-[12.5px] text-gray-400">{trainingModule.category}</p>

        <div className="mt-8 flex justify-center gap-10 text-[12px] text-gray-500">
          <div>
            <div className="font-semibold text-gray-800">{completedDate}</div>
            <div className="mt-0.5 uppercase tracking-[.1em]">Completion date</div>
          </div>
          {progress.quiz_score != null && (
            <div>
              <div className="font-semibold text-gray-800">{progress.quiz_score}%</div>
              <div className="mt-0.5 uppercase tracking-[.1em]">Quiz score</div>
            </div>
          )}
          {expiresAt && (
            <div>
              <div className="font-semibold text-gray-800">{expiresAt}</div>
              <div className="mt-0.5 uppercase tracking-[.1em]">Renew by</div>
            </div>
          )}
        </div>

        <p className="mt-10 text-[10px] tracking-[.15em] text-gray-300 uppercase">
          Certificate ID {progress.id}
        </p>
      </div>
    </div>
  );
}
