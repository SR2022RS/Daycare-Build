"use client";

import { useActionState } from "react";

import { addChildContact, removeChildContact } from "@/lib/children/contacts";
import type { ChildContactKind } from "@/types/database.types";

export interface ChildContact {
  id: string;
  kind: ChildContactKind;
  fullName: string;
  relationship: string | null;
  phone: string | null;
  note: string | null;
}

// Ordered by how urgently someone standing at the door needs them. "Do not
// release" is last but styled loudest -- it is the one entry where being
// missed has a consequence nobody can undo.
const GROUPS: { kind: ChildContactKind; title: string; blurb: string }[] = [
  {
    kind: "emergency",
    title: "Emergency contacts",
    blurb: "Called when a parent cannot be reached.",
  },
  {
    kind: "pickup_allowed",
    title: "Allowed to pick up",
    blurb: "Anyone besides the parents who may collect this child.",
  },
  {
    kind: "pickup_denied",
    title: "NOT allowed to pick up",
    blurb: "Shown in red at the kiosk. Add a note if there is a court order.",
  },
];

export function ChildContacts({ childId, contacts }: { childId: string; contacts: ChildContact[] }) {
  const [state, action, pending] = useActionState(addChildContact, undefined);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4.5 py-3.5">
        <h2 className="text-[15px] font-semibold text-gray-900">Emergency &amp; pickup</h2>
        <p className="mt-0.5 text-[12.5px] text-gray-500">
          Who to call, who may collect this child, and who may not.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {GROUPS.map((group) => {
          const rows = contacts.filter((c) => c.kind === group.kind);
          const denied = group.kind === "pickup_denied";

          return (
            <div key={group.kind} className="px-4.5 py-3.5">
              <h3
                className={`text-[13px] font-semibold ${denied ? "text-red-700" : "text-gray-800"}`}
              >
                {group.title}
              </h3>
              <p className="mt-0.5 text-[11.5px] text-gray-500">{group.blurb}</p>

              {rows.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-gray-400">None on file.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {rows.map((contact) => (
                    <li
                      key={contact.id}
                      className={`rounded-md border px-3 py-2 ${
                        denied ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-[13px] font-semibold ${denied ? "text-red-800" : "text-gray-900"}`}
                        >
                          {contact.fullName}
                        </span>
                        {contact.relationship && (
                          <span className="text-[11.5px] text-gray-500">{contact.relationship}</span>
                        )}
                        <RemoveContact childId={childId} contactId={contact.id} />
                      </div>
                      {contact.phone && (
                        <p className="mt-0.5 text-[12.5px] text-gray-600">{contact.phone}</p>
                      )}
                      {contact.note && (
                        <p
                          className={`mt-0.5 text-[12px] ${denied ? "font-medium text-red-700" : "text-gray-500"}`}
                        >
                          {contact.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

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

        <select
          name="kind"
          defaultValue="emergency"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        >
          <option value="emergency">Emergency contact</option>
          <option value="pickup_allowed">Allowed to pick up</option>
          <option value="pickup_denied">NOT allowed to pick up</option>
        </select>

        <input
          name="fullName"
          placeholder="Full name"
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            name="phone"
            placeholder="Phone"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <input
            name="relationship"
            placeholder="Relationship (e.g. Aunt)"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
        </div>

        <input
          name="note"
          placeholder="Note (e.g. court order on file)"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        />

        <button
          type="submit"
          disabled={pending}
          className="mt-1 self-start rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add contact"}
        </button>
      </form>
    </section>
  );
}

function RemoveContact({ childId, contactId }: { childId: string; contactId: string }) {
  const [, action, pending] = useActionState(removeChildContact, undefined);

  return (
    <form action={action} className="ml-auto">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="contactId" value={contactId} />
      <button
        type="submit"
        disabled={pending}
        className="text-[11px] font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
    </form>
  );
}
