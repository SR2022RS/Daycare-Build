"use client";

import { useActionState } from "react";

import { addManualCharge } from "@/lib/billing/actions";

export function AddChargeForm({ kids }: { kids: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addManualCharge, undefined);

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-gray-100 px-4.5 py-4">
      <div className="text-[12.5px] font-semibold text-gray-700">Add a one-off charge or credit</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          name="childId"
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        >
          {kids.length === 0 && <option value="">No children linked</option>}
          {kids.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="type"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        >
          <option value="fee">Fee</option>
          <option value="credit">Credit</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <input
          type="number"
          step="0.01"
          min="0.01"
          name="amount"
          placeholder="Amount"
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        />
      </div>
      <input
        name="description"
        placeholder="Description (e.g. Late pickup 8/19, Sibling discount)"
        required
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
      />
      {state?.message && <p className="text-xs text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={kids.length === 0 || pending}
        className="mt-1 self-start rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add charge"}
      </button>
    </form>
  );
}
