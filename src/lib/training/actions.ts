"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseQuizQuestions, scoreQuiz } from "@/lib/training/quiz";
import type { ContentBlockType, CredentialType } from "@/types/database.types";

// Mark-complete path for modules with no quiz -- completion rule is
// mark-complete OR quiz-pass, per module (a module either has a quiz row
// gating completion, or it doesn't and this is the only way to finish it).
export async function markModuleComplete(formData: FormData) {
  const session = await verifySession();
  const moduleId = formData.get("moduleId");
  if (typeof moduleId !== "string" || !moduleId) return;

  // Admin client: staff_training_progress_write is now director/admin-only
  // in RLS (a direct staff write there could forge quiz-gated completions),
  // so this write is trusted only because it's this exact, narrow shape.
  const admin = createAdminClient();
  await admin.from("staff_training_progress").upsert(
    {
      staff_id: session.profile.id,
      module_id: moduleId,
      status: "completed",
      completed_at: new Date().toISOString(),
    },
    { onConflict: "staff_id,module_id" },
  );

  revalidatePath(`/training/${moduleId}`);
  revalidatePath("/training");
}

export async function submitQuizAttempt(formData: FormData) {
  const session = await verifySession();
  const moduleId = formData.get("moduleId");
  if (typeof moduleId !== "string" || !moduleId) return;

  const supabase = await createClient();
  const { data: quiz } = await supabase
    .from("training_quizzes")
    .select("questions, passing_score")
    .eq("module_id", moduleId)
    .maybeSingle();

  const questions = parseQuizQuestions(quiz?.questions);
  const answers = questions.map((_, i) => Number(formData.get(`answer_${i}`)));
  const score = scoreQuiz(questions, answers);
  const passed = score >= (quiz?.passing_score ?? 80);

  await supabase.from("quiz_attempts").insert({
    staff_id: session.profile.id,
    module_id: moduleId,
    score,
    passed,
  });

  if (passed) {
    const admin = createAdminClient();
    await admin.from("staff_training_progress").upsert(
      {
        staff_id: session.profile.id,
        module_id: moduleId,
        status: "completed",
        completed_at: new Date().toISOString(),
        quiz_score: score,
      },
      { onConflict: "staff_id,module_id" },
    );
  }

  revalidatePath(`/training/${moduleId}`);
  revalidatePath("/training");
  redirect(`/training/${moduleId}?attempt=${passed ? "passed" : "failed"}&score=${score}`);
}

export async function addContentBlock(formData: FormData) {
  await requireRole(["director", "platform_admin"]);
  const moduleId = formData.get("moduleId");
  const blockType = formData.get("blockType");
  const sortOrder = formData.get("sortOrder");

  if (typeof moduleId !== "string" || !moduleId || typeof blockType !== "string") return;

  const supabase = await createClient();
  await supabase.from("training_content_blocks").insert({
    module_id: moduleId,
    block_type: blockType as ContentBlockType,
    sort_order: Number(sortOrder) || 0,
    video_url: blockType === "video" ? str(formData, "value") : null,
    text_content: blockType === "text" ? str(formData, "value") : null,
    file_url: blockType === "file" ? str(formData, "value") : null,
  });

  revalidatePath(`/training/${moduleId}`);
}

export async function deleteContentBlock(formData: FormData) {
  await requireRole(["director", "platform_admin"]);
  const blockId = formData.get("blockId");
  const moduleId = formData.get("moduleId");
  if (typeof blockId !== "string" || !blockId) return;

  const supabase = await createClient();
  await supabase.from("training_content_blocks").delete().eq("id", blockId);

  if (typeof moduleId === "string") revalidatePath(`/training/${moduleId}`);
}

export async function upsertQuiz(formData: FormData) {
  await requireRole(["director", "platform_admin"]);
  const moduleId = formData.get("moduleId");
  const questionsRaw = formData.get("questionsJson");
  const passingScore = formData.get("passingScore");

  if (typeof moduleId !== "string" || !moduleId || typeof questionsRaw !== "string") return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(questionsRaw);
  } catch {
    return;
  }
  if (parseQuizQuestions(parsed).length === 0) return;

  const supabase = await createClient();
  await supabase.from("training_quizzes").upsert(
    {
      module_id: moduleId,
      questions: parsed,
      passing_score: Number(passingScore) || 80,
    },
    { onConflict: "module_id" },
  );

  revalidatePath(`/training/${moduleId}`);
}

export async function updateModuleCredentialLink(formData: FormData) {
  await requireRole(["director", "platform_admin"]);
  const moduleId = formData.get("moduleId");
  const credentialType = formData.get("credentialType");
  const renewalMonths = formData.get("renewalMonths");

  if (typeof moduleId !== "string" || !moduleId) return;

  const supabase = await createClient();
  await supabase
    .from("training_modules")
    .update({
      credential_type:
        typeof credentialType === "string" && credentialType ? (credentialType as CredentialType) : null,
      renewal_months:
        typeof renewalMonths === "string" && renewalMonths ? Number(renewalMonths) : null,
    })
    .eq("id", moduleId);

  revalidatePath(`/training/${moduleId}`);
}

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
