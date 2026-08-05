"use client";

import { useActionState } from "react";
import Link from "next/link";

import { requestPasswordReset } from "@/lib/auth/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <form action={action} className="flex flex-col">
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-[10.5px] font-semibold tracking-[.18em] text-[#8C857C] uppercase"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 w-full rounded-lg border border-[var(--brand-accent)]/20 bg-[#17171C] px-3.5 text-sm text-[#F5F3EE] outline-none focus:border-[var(--brand-accent)]"
        />
      </div>

      {state?.message && <p className="mt-4 text-sm text-[#9A948C]">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 h-[46px] rounded-lg bg-[var(--brand-accent)] text-[13px] font-bold tracking-[.12em] text-[#06323A] uppercase transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send reset link"}
      </button>

      <p className="mt-6 text-center text-xs text-[#7E7871]">
        <Link href="/login" className="text-[var(--brand-accent)] hover:opacity-80">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
