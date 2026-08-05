import { BookMarked } from "lucide-react";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createSop } from "@/lib/sops/actions";

const AUDIENCE_LABELS = { all: "All staff", staff: "Staff", site_lead: "Site leads" } as const;

export default async function SopsPage() {
  const session = await verifySession();
  const supabase = await createClient();
  const isDirector = session.profile.role !== "staff";

  const { data: sops } = await supabase
    .from("sops")
    .select("id, title, category, audience, content, version, updated_at")
    .order("category")
    .order("title");

  const byCategory = new Map<string, typeof sops>();
  for (const sop of sops ?? []) {
    if (!byCategory.has(sop.category)) byCategory.set(sop.category, []);
    byCategory.get(sop.category)!.push(sop);
  }

  return (
    <div className="max-w-[900px]">
      {Array.from(byCategory.entries()).map(([category, items]) => (
        <section key={category} className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">{category}</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {(items ?? []).map((sop) => (
              <li key={sop.id} className="px-4.5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <BookMarked className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                  <span className="text-[13.5px] font-medium text-gray-900">{sop.title}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 uppercase">
                    {AUDIENCE_LABELS[sop.audience]}
                  </span>
                  <span className="ml-auto text-[11px] text-gray-400">
                    v{sop.version} &middot; {sop.updated_at.slice(0, 10)}
                  </span>
                </div>
                {sop.content ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-gray-600">{sop.content}</p>
                ) : (
                  <p className="mt-1.5 text-[12px] text-gray-400 italic">Content coming soon.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {byCategory.size === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-4.5 py-6 text-center text-sm text-gray-500">
          No SOPs published yet.
        </div>
      )}

      {isDirector && (
        <details className="group mt-4 max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white">
          <summary className="cursor-pointer px-4.5 py-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50">
            + Add an SOP
          </summary>
          <form action={createSop} className="flex flex-col gap-2.5 border-t border-gray-100 p-4.5">
            <input
              name="title"
              placeholder="Title"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
            <input
              name="category"
              placeholder="Category (e.g. Opening Procedures)"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
            <label className="flex flex-col text-xs text-gray-500">
              Visible to
              <select
                name="audience"
                defaultValue="all"
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              >
                <option value="all">All staff</option>
                <option value="staff">Staff only</option>
                <option value="site_lead">Site leads only</option>
              </select>
            </label>
            <textarea
              name="content"
              placeholder="Steps / content (optional — can be added later)"
              rows={4}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
            <button
              type="submit"
              className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
            >
              Add SOP
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
