"use client";

import { useActionState } from "react";

import { addGuardianWithFeedback } from "@/lib/children/actions";

export interface GuardianRow {
  guardianId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  isPayer: boolean;
}

const field =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

/**
 * Parents, for the staff screens.
 *
 * The "already on file" note is deliberate: `staff_link_guardian` reuses an
 * existing parent when the email or phone matches, so a second child gets
 * linked to the same record rather than creating a twin. Without saying so,
 * a teacher who types a mother's details for her second child and sees no new
 * row appear would reasonably conclude it had failed and type them again.
 */
export function StaffGuardians({ childId, guardians }: { childId: string; guardians: GuardianRow[] }) {
  const [state, action, pending] = useActionState(addGuardianWithFeedback, undefined);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4.5 py-3.5">
        <h2 className="text-[15px] font-semibold text-gray-900">Parents &amp; guardians</h2>
        <p className="mt-0.5 text-[12.5px] text-gray-500">
          Cell numbers are what make text messages reach them.
        </p>
      </div>

      <ul className="divide-y divide-gray-100">
        {guardians.map((g) => (
          <li key={g.guardianId} className="px-4.5 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[13.5px] font-semibold text-gray-900">{g.fullName}</span>
              {g.relationship && <span className="text-[11.5px] text-gray-500">{g.relationship}</span>}
              {g.isPayer && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-[.06em] text-amber-700 uppercase">
                  Billed
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              {[g.phone, g.email].filter(Boolean).join(" · ") || "No contact info"}
            </p>
          </li>
        ))}
        {guardians.length === 0 && (
          <li className="px-4.5 py-6 text-center text-sm text-gray-500">No parents on file yet.</li>
        )}
      </ul>

      <form action={action} className="flex flex-col gap-2 border-t border-gray-100 px-4.5 py-4">
        <input type="hidden" name="childId" value={childId} />

        {state?.message && (
          <p
            className={`rounded-md px-3 py-2 text-[12.5px] ${
              state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
            }`}
          >
            {state.message}
          </p>
        )}

        <input name="fullName" placeholder="Parent's full name" required className={field} />

        <div className="grid grid-cols-2 gap-2">
          <input name="phone" placeholder="Cell number" className={field} />
          <input name="email" type="email" placeholder="Email" className={field} />
        </div>

        <input name="relationship" placeholder="Relationship (e.g. Mother)" className={field} />

        <label className="flex items-center gap-2 text-[12.5px] text-gray-600">
          <input type="checkbox" name="isPayer" className="h-3.5 w-3.5" />
          This parent gets the bill
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 self-start rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add parent"}
        </button>

        <p className="text-[11.5px] text-gray-400">
          If this parent is already in the system for a sibling, they will be linked to this child
          rather than added twice.
        </p>
      </form>
    </section>
  );
}
