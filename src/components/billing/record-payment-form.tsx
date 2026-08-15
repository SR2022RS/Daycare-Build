"use client";

import { useActionState } from "react";

import { todayISO } from "@/lib/billing/dates";
import { recordPayment } from "@/lib/billing/actions";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/labels";

export function RecordPaymentForm({ invoiceId, balance }: { invoiceId: string; balance: number }) {
  const [state, action, pending] = useActionState(recordPayment, undefined);

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-gray-100 px-4.5 py-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label className="flex flex-col text-xs text-gray-500">
        Amount ($)
        <input
          type="number"
          step="0.01"
          min="0.01"
          name="amount"
          defaultValue={balance > 0 ? balance.toFixed(2) : ""}
          required
          className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        />
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Method
        <select
          name="method"
          className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        >
          {(["cash", "check", "zelle", "venmo", "other"] as const).map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Paid on
        <input
          type="date"
          name="paidAt"
          defaultValue={todayISO()}
          required
          className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        />
      </label>
      <input
        name="note"
        placeholder="Note (optional — check number, etc.)"
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
      />
      {state?.message && <p className="text-xs text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Recording…" : "Record payment"}
      </button>
    </form>
  );
}
