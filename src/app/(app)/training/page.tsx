import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { TrainingModuleList, type ModuleEntry } from "@/components/training/training-module-list";
import type { TrainingProgressStatus } from "@/types/database.types";

export default async function TrainingPage() {
  const session = await verifySession();
  const supabase = await createClient();
  const isDirector = session.profile.role !== "staff";

  const { data: modules } = await supabase
    .from("training_modules")
    .select("id, title, category, required, sort_order")
    .eq("tenant_id", session.profile.tenantId)
    .order("category")
    .order("sort_order");

  const moduleIds = (modules ?? []).map((m) => m.id);

  if (isDirector) {
    const [{ count: staffCount }, { data: progressRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", session.profile.tenantId)
        .eq("role", "staff"),
      moduleIds.length
        ? supabase.from("staff_training_progress").select("module_id, status").in("module_id", moduleIds)
        : Promise.resolve({ data: [] as { module_id: string; status: TrainingProgressStatus }[] }),
    ]);

    const completedByModule = new Map<string, number>();
    for (const row of progressRows ?? []) {
      if (row.status === "completed") {
        completedByModule.set(row.module_id, (completedByModule.get(row.module_id) ?? 0) + 1);
      }
    }

    const total = staffCount ?? 0;
    const entries: ModuleEntry[] = (modules ?? []).map((m) => {
      const done = completedByModule.get(m.id) ?? 0;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        id: m.id,
        title: m.title,
        category: m.category,
        required: m.required,
        pct,
        statusLabel: `${done} of ${total}`,
        statusTone: pct >= 90 ? "done" : pct >= 70 ? "progress" : "todo",
        meta: `Assigned to ${total} staff`,
      };
    });

    const overallDone = Array.from(completedByModule.values()).reduce((a, b) => a + b, 0);
    const overallTotal = entries.length * total;
    const overallPct = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

    return (
      <TrainingModuleList
        modules={entries}
        isDirector
        headline={{
          label: "Studio-wide completion",
          value: `${overallPct}%`,
          meta: `${overallDone} of ${overallTotal} assignments`,
          pct: overallPct,
        }}
      />
    );
  }

  const { data: progressRows } = moduleIds.length
    ? await supabase
        .from("staff_training_progress")
        .select("module_id, status")
        .eq("staff_id", session.profile.id)
        .in("module_id", moduleIds)
    : { data: [] as { module_id: string; status: TrainingProgressStatus }[] };

  const statusByModule = new Map(progressRows?.map((row) => [row.module_id, row.status]));

  const entries: ModuleEntry[] = (modules ?? []).map((m) => {
    const status = statusByModule.get(m.id) ?? "not_started";
    const pct = status === "completed" ? 100 : status === "in_progress" ? 50 : 0;
    return {
      id: m.id,
      title: m.title,
      category: m.category,
      required: m.required,
      pct,
      statusLabel: status === "completed" ? "Completed" : status === "in_progress" ? "In progress" : "Not started",
      statusTone: status === "completed" ? "done" : status === "in_progress" ? "progress" : "todo",
      meta:
        status === "completed"
          ? "Completed"
          : status === "in_progress"
            ? "Resume where you left off"
            : "Not started",
    };
  });

  const completedCount = entries.filter((e) => e.pct === 100).length;
  const overallPct = entries.length > 0 ? Math.round((completedCount / entries.length) * 100) : 0;

  return (
    <TrainingModuleList
      modules={entries}
      isDirector={false}
      headline={{
        label: "Your completion",
        value: `${completedCount} of ${entries.length}`,
        meta: `${entries.filter((e) => e.statusTone === "progress").length} in progress`,
        pct: overallPct,
      }}
    />
  );
}
