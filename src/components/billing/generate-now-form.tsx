"use client";

import { useActionState } from "react";

import { generateNow } from "@/lib/billing/actions";

export function GenerateNowForm() {
  const [state, action, pending] = useActionState(generateNow, undefined);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate now"}
      </button>
      {state?.message && <p className="text-xs text-gray-500">{state.message}</p>}
    </form>
  );
}
