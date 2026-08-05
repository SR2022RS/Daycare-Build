import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CheckCircle2, FileText, PlayCircle, Video } from "lucide-react";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  addContentBlock,
  deleteContentBlock,
  markModuleComplete,
  updateModuleCredentialLink,
  upsertQuiz,
} from "@/lib/training/actions";
import { parseQuizQuestions } from "@/lib/training/quiz";
import { ALL_CREDENTIAL_TYPES, CREDENTIAL_LABELS } from "@/lib/staff/credentials";

export default async function ModuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ moduleId: string }>;
  searchParams: Promise<{ attempt?: string; score?: string }>;
}) {
  const { moduleId } = await params;
  const { attempt, score } = await searchParams;
  const session = await verifySession();
  const supabase = await createClient();
  const isDirector = session.profile.role !== "staff";

  const { data: trainingModule } = await supabase
    .from("training_modules")
    .select("id, title, category, required, content_url, credential_type, renewal_months")
    .eq("id", moduleId)
    .eq("tenant_id", session.profile.tenantId)
    .single();

  if (!trainingModule) {
    notFound();
  }

  const [{ data: blocks }, { data: quiz }, { data: progress }, { data: attempts }] = await Promise.all([
    supabase
      .from("training_content_blocks")
      .select("id, block_type, video_url, text_content, file_url, sort_order")
      .eq("module_id", moduleId)
      .order("sort_order"),
    supabase.from("training_quizzes").select("questions, passing_score").eq("module_id", moduleId).maybeSingle(),
    supabase
      .from("staff_training_progress")
      .select("id, status, completed_at, quiz_score")
      .eq("staff_id", session.profile.id)
      .eq("module_id", moduleId)
      .maybeSingle(),
    supabase
      .from("quiz_attempts")
      .select("score, passed, attempted_at")
      .eq("staff_id", session.profile.id)
      .eq("module_id", moduleId)
      .order("attempted_at", { ascending: false }),
  ]);

  const questions = parseQuizQuestions(quiz?.questions);
  const hasQuiz = questions.length > 0;
  const isCompleted = progress?.status === "completed";

  return (
    <div className="max-w-[900px]">
      <Link
        href="/training"
        className="mb-3.5 inline-block text-[12.5px] font-semibold text-gray-500 hover:text-[var(--brand-primary)]"
      >
        &larr; Coursework
      </Link>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-xl font-semibold text-gray-900">{trainingModule.title}</h1>
          {trainingModule.required && (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] text-gray-600 uppercase">
              Required
            </span>
          )}
          {isCompleted && (
            <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] text-green-700 uppercase">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-gray-500">
          {trainingModule.category}
          {trainingModule.credential_type &&
            ` · Linked to ${CREDENTIAL_LABELS[trainingModule.credential_type]}${trainingModule.renewal_months ? ` (renews every ${trainingModule.renewal_months}mo)` : ""}`}
        </p>
      </div>

      {attempt && (
        <div
          className={`mb-4 rounded-xl border px-4.5 py-3.5 text-[13px] ${
            attempt === "passed"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {attempt === "passed"
            ? `Nice work — you passed with a score of ${score}%.`
            : `Score: ${score}%. That's below the passing threshold — you can retake the quiz any time.`}
        </div>
      )}

      {!isDirector && (
        <>
          <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4.5 py-3.5">
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Content</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {(blocks ?? []).map((block) => (
                <li key={block.id} className="px-4.5 py-3.5">
                  {block.block_type === "video" && block.video_url && (
                    <a
                      href={block.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--brand-primary)] hover:opacity-80"
                    >
                      <Video className="h-4 w-4" /> Watch video
                    </a>
                  )}
                  {block.block_type === "text" && (
                    <p className="whitespace-pre-wrap text-[13.5px] text-gray-700">{block.text_content}</p>
                  )}
                  {block.block_type === "file" && block.file_url && (
                    <a
                      href={block.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--brand-primary)] hover:opacity-80"
                    >
                      <FileText className="h-4 w-4" /> View file
                    </a>
                  )}
                </li>
              ))}
              {(blocks ?? []).length === 0 && trainingModule.content_url && (
                <li className="px-4.5 py-3.5">
                  <a
                    href={trainingModule.content_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--brand-primary)] hover:opacity-80"
                  >
                    <PlayCircle className="h-4 w-4" /> Open content
                  </a>
                </li>
              )}
              {(blocks ?? []).length === 0 && !trainingModule.content_url && (
                <li className="px-4.5 py-6 text-center text-sm text-gray-500">No content posted yet.</li>
              )}
            </ul>
          </section>

          <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4.5 py-3.5">
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">
                {hasQuiz ? "Quiz" : "Completion"}
              </h2>
            </div>
            <div className="px-4.5 py-4">
              {hasQuiz ? (
                <>
                  <p className="mb-3 text-[13px] text-gray-500">
                    {questions.length} question{questions.length === 1 ? "" : "s"} &middot; passing score{" "}
                    {quiz?.passing_score ?? 80}% &middot; unlimited retakes
                  </p>
                  <Link
                    href={`/training/${moduleId}/quiz`}
                    className="inline-block rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
                  >
                    {isCompleted ? "Retake quiz" : "Take the quiz"}
                  </Link>
                  {(attempts ?? []).length > 0 && (
                    <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100 pt-2">
                      {(attempts ?? []).map((a, i) => (
                        <li key={i} className="flex items-center justify-between py-1.5 text-[12.5px]">
                          <span className={a.passed ? "text-green-700" : "text-gray-500"}>
                            {a.score}% {a.passed ? "· Passed" : "· Not passed"}
                          </span>
                          <span className="text-gray-400 tabular-nums">{a.attempted_at.slice(0, 10)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : isCompleted ? (
                <p className="text-[13px] text-green-700">
                  Completed {progress?.completed_at?.slice(0, 10)}.
                </p>
              ) : (
                <form action={markModuleComplete}>
                  <input type="hidden" name="moduleId" value={moduleId} />
                  <button
                    type="submit"
                    className="rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
                  >
                    Mark complete
                  </button>
                </form>
              )}
            </div>
          </section>

          {isCompleted && progress && (
            <Link
              href={`/certificates/${progress.id}`}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4.5 py-3.5 text-[13.5px] font-semibold text-[var(--brand-primary)] hover:opacity-80"
            >
              <Award className="h-4 w-4" /> View / print certificate
            </Link>
          )}
        </>
      )}

      {isDirector && (
        <>
          <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4.5 py-3.5">
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Content blocks</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {(blocks ?? []).map((block) => (
                <li key={block.id} className="flex items-center justify-between gap-3 px-4.5 py-3">
                  <div className="min-w-0">
                    <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 uppercase">
                      {block.block_type}
                    </span>
                    <span className="truncate text-[13px] text-gray-700">
                      {block.video_url || block.file_url || block.text_content}
                    </span>
                  </div>
                  <form action={deleteContentBlock}>
                    <input type="hidden" name="blockId" value={block.id} />
                    <input type="hidden" name="moduleId" value={moduleId} />
                    <button type="submit" className="shrink-0 text-[11px] font-medium text-gray-400 hover:text-red-600">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
              {(blocks ?? []).length === 0 && (
                <li className="px-4.5 py-6 text-center text-sm text-gray-500">No content blocks yet.</li>
              )}
            </ul>
            <form action={addContentBlock} className="flex flex-wrap items-end gap-2 border-t border-gray-100 px-4.5 py-4">
              <input type="hidden" name="moduleId" value={moduleId} />
              <label className="flex flex-col text-xs text-gray-500">
                Type
                <select
                  name="blockType"
                  defaultValue="video"
                  className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                >
                  <option value="video">Video URL</option>
                  <option value="text">Text block</option>
                  <option value="file">File URL</option>
                </select>
              </label>
              <label className="flex min-w-[240px] flex-1 flex-col text-xs text-gray-500">
                Content
                <input
                  name="value"
                  placeholder="URL, or text content"
                  className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                />
              </label>
              <label className="flex w-20 flex-col text-xs text-gray-500">
                Order
                <input
                  type="number"
                  name="sortOrder"
                  defaultValue={(blocks ?? []).length}
                  className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Add block
              </button>
            </form>
          </section>

          <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4.5 py-3.5">
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Quiz</h2>
              <div className="mt-0.5 text-[11.5px] text-gray-400">
                Completion rule: mark-complete if no quiz, quiz-pass if one exists
              </div>
            </div>
            <form action={upsertQuiz} className="flex flex-col gap-2.5 p-4.5">
              <input type="hidden" name="moduleId" value={moduleId} />
              <label className="flex flex-col text-xs text-gray-500">
                Questions (JSON array of {"{question, options[], correctIndex}"})
                <textarea
                  name="questionsJson"
                  rows={8}
                  defaultValue={questions.length > 0 ? JSON.stringify(questions, null, 2) : ""}
                  placeholder={JSON.stringify(
                    [{ question: "Sample question?", options: ["A", "B", "C"], correctIndex: 0 }],
                    null,
                    2,
                  )}
                  className="mt-1 rounded-md border border-gray-300 px-3 py-2 font-mono text-xs focus:border-[var(--brand-accent)] focus:outline-none"
                />
              </label>
              <label className="flex w-40 flex-col text-xs text-gray-500">
                Passing score (%)
                <input
                  type="number"
                  name="passingScore"
                  defaultValue={quiz?.passing_score ?? 80}
                  min={0}
                  max={100}
                  className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
              >
                Save quiz
              </button>
            </form>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4.5 py-3.5">
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Credential auto-wire</h2>
              <div className="mt-0.5 text-[11.5px] text-gray-400">
                Completing this module writes the clearance date straight onto the staff&apos;s credential record
              </div>
            </div>
            <form action={updateModuleCredentialLink} className="flex flex-wrap items-end gap-2 p-4.5">
              <input type="hidden" name="moduleId" value={moduleId} />
              <label className="flex flex-col text-xs text-gray-500">
                Linked credential
                <select
                  name="credentialType"
                  defaultValue={trainingModule.credential_type ?? ""}
                  className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                >
                  <option value="">None</option>
                  {ALL_CREDENTIAL_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CREDENTIAL_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex w-40 flex-col text-xs text-gray-500">
                Renews every (months)
                <input
                  type="number"
                  name="renewalMonths"
                  defaultValue={trainingModule.renewal_months ?? ""}
                  min={0}
                  className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Save
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
