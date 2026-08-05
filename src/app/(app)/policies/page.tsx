import { FileText } from "lucide-react";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { acknowledgePolicy, createPolicy } from "@/lib/policies/actions";

export default async function PoliciesPage() {
  const session = await verifySession();
  const supabase = await createClient();
  const isDirector = session.profile.role !== "staff";

  const [{ data: policies }, { count: staffTotal }, { data: ackRows }, { data: myAcks }] =
    await Promise.all([
      supabase
        .from("policies")
        .select("id, title, category, file_url, version")
        .eq("tenant_id", session.profile.tenantId)
        .order("category"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", session.profile.tenantId)
        .eq("role", "staff"),
      supabase.from("policy_acknowledgments").select("policy_id").eq("tenant_id", session.profile.tenantId),
      isDirector
        ? Promise.resolve({ data: [] as { policy_id: string }[] })
        : supabase.from("policy_acknowledgments").select("policy_id").eq("staff_id", session.profile.id),
    ]);

  const ackCountByPolicy = new Map<string, number>();
  for (const row of ackRows ?? []) {
    ackCountByPolicy.set(row.policy_id, (ackCountByPolicy.get(row.policy_id) ?? 0) + 1);
  }
  const myAckedPolicyIds = new Set((myAcks ?? []).map((r) => r.policy_id));

  return (
    <div className="max-w-[1100px]">
      <div className="mb-4 flex items-center gap-3.5 rounded-xl border border-gray-200 bg-white px-5 py-3.5">
        <span className="text-[13px] text-gray-600">
          {isDirector
            ? `Acknowledgment counts are live across all ${staffTotal ?? 0} staff.`
            : "Review each policy and acknowledge that you've read it."}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[2.4fr_1.1fr_1fr_1fr_210px] gap-3 border-b border-gray-100 bg-gray-50 px-4.5 py-2.5 text-[10px] font-bold tracking-[.13em] text-gray-400 uppercase">
          <span>Policy</span>
          <span>Category</span>
          <span>Version</span>
          <span>Acknowledged</span>
          <span className="text-right">Action</span>
        </div>
        {(policies ?? []).map((policy) => {
          const ackCount = ackCountByPolicy.get(policy.id) ?? 0;
          const iAcked = myAckedPolicyIds.has(policy.id);
          const showAcknowledge = !isDirector && !iAcked;

          return (
            <div
              key={policy.id}
              className="grid grid-cols-1 items-center gap-2 border-b border-gray-100 px-4.5 py-3 sm:grid-cols-[2.4fr_1.1fr_1fr_1fr_210px] sm:gap-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-gray-900">{policy.title}</div>
                </div>
              </div>
              <span className="text-[12.5px] text-gray-500">{policy.category}</span>
              <span className="text-[12.5px] text-gray-500 tabular-nums">v{policy.version}</span>
              <span
                className={`text-[12.5px] font-medium tabular-nums ${
                  ackCount === (staffTotal ?? 0) && (staffTotal ?? 0) > 0 ? "text-green-700" : "text-amber-700"
                }`}
              >
                {ackCount} of {staffTotal ?? 0}
              </span>
              <div className="flex items-center justify-end gap-2">
                <a
                  href={policy.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300"
                >
                  View
                </a>
                {showAcknowledge && (
                  <form action={acknowledgePolicy}>
                    <input type="hidden" name="policyId" value={policy.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-semibold text-[#06323A] hover:opacity-90"
                    >
                      Acknowledge
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
        {(policies ?? []).length === 0 && (
          <div className="px-4.5 py-6 text-sm text-gray-500">No policies published yet.</div>
        )}
      </div>

      {isDirector && (
        <form
          action={createPolicy}
          className="mt-4 flex max-w-md flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4.5"
        >
          <h2 className="text-sm font-semibold text-gray-900">Add a policy document</h2>
          <input
            name="title"
            placeholder="Title"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <input
            name="category"
            placeholder="Category (e.g. Staff Handbook)"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <input
            name="fileUrl"
            placeholder="Document URL"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <button
            type="submit"
            className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
          >
            Add policy
          </button>
        </form>
      )}
    </div>
  );
}
