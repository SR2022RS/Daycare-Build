import Link from "next/link";
import { notFound } from "next/navigation";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { submitQuizAttempt } from "@/lib/training/actions";
import { parseQuizQuestions } from "@/lib/training/quiz";

export default async function QuizPage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const session = await verifySession();
  const supabase = await createClient();

  const [{ data: trainingModule }, { data: quiz }] = await Promise.all([
    supabase
      .from("training_modules")
      .select("id, title")
      .eq("id", moduleId)
      .eq("tenant_id", session.profile.tenantId)
      .single(),
    supabase.from("training_quizzes").select("questions, passing_score").eq("module_id", moduleId).maybeSingle(),
  ]);

  const questions = parseQuizQuestions(quiz?.questions);

  if (!trainingModule || questions.length === 0) {
    notFound();
  }

  return (
    <div className="max-w-[720px]">
      <Link
        href={`/training/${moduleId}`}
        className="mb-3.5 inline-block text-[12.5px] font-semibold text-gray-500 hover:text-[var(--brand-primary)]"
      >
        &larr; {trainingModule.title}
      </Link>

      <form action={submitQuizAttempt} className="flex flex-col gap-4">
        <input type="hidden" name="moduleId" value={moduleId} />
        <div className="rounded-xl border border-gray-200 bg-white p-4.5">
          <h1 className="font-serif text-lg font-semibold text-gray-900">{trainingModule.title} &mdash; Quiz</h1>
          <p className="mt-1 text-[12.5px] text-gray-500">
            {questions.length} question{questions.length === 1 ? "" : "s"} &middot; passing score{" "}
            {quiz?.passing_score ?? 80}% &middot; you can retake this as many times as you need
          </p>
        </div>

        {questions.map((q, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4.5">
            <p className="mb-3 text-[13.5px] font-medium text-gray-900">
              {i + 1}. {q.question}
            </p>
            <div className="flex flex-col gap-2">
              {q.options.map((option, oi) => (
                <label key={oi} className="flex items-center gap-2 text-[13px] text-gray-700">
                  <input type="radio" name={`answer_${i}`} value={oi} required className="h-3.5 w-3.5" />
                  {option}
                </label>
              ))}
            </div>
          </div>
        ))}

        <button
          type="submit"
          className="self-start rounded-md bg-[var(--brand-accent)] px-6 py-2.5 text-sm font-semibold text-[#06323A] hover:opacity-90"
        >
          Submit quiz
        </button>
      </form>
    </div>
  );
}
