"use client";

import { useActionState } from "react";

import { applyOverpaymentCredit } from "@/lib/billing/actions";

export function ApplyCreditForm({ invoiceId, amount }: { invoiceId: string; amount: number }) {
  const [state, action, pending] = useActionState(applyOverpaymentCredit, undefined);

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-[#06323A] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Applying…" : `Apply $${amount.toFixed(2)} as a credit`}
      </button>
      {state?.message && <p className="text-[11.5px] font-medium text-red-700">{state.message}</p>}
    </form>
  );
}
