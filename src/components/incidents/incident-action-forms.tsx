"use client";

import { useActionState } from "react";

import { markParentNotified, signIncident } from "@/lib/incidents/actions";

export function SignForm({ incidentId }: { incidentId: string }) {
  const [state, action, pending] = useActionState(signIncident, undefined);

  return (
    <div>
      <form action={action}>
        <input type="hidden" name="incidentId" value={incidentId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-semibold text-[#06323A] hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Signing…" : "Sign"}
        </button>
      </form>
      {state?.message && <p className="mt-1.5 text-xs text-red-600">{state.message}</p>}
    </div>
  );
}

export function MarkParentNotifiedForm({ incidentId }: { incidentId: string }) {
  const [state, action, pending] = useActionState(markParentNotified, undefined);

  return (
    <div>
      <form action={action}>
        <input type="hidden" name="incidentId" value={incidentId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? "Updating…" : "Mark parent notified"}
        </button>
      </form>
      {state?.message && <p className="mt-1.5 text-xs text-red-600">{state.message}</p>}
    </div>
  );
}
