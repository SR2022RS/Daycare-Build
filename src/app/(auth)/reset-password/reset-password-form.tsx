"use client";

import { useActionState } from "react";

import { updatePassword } from "@/lib/auth/actions";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={action} className="flex flex-col">
      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-[10.5px] font-semibold tracking-[.18em] text-[#8C857C] uppercase"
        >
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="h-11 w-full rounded-lg border border-[var(--brand-accent)]/20 bg-[#17171C] px-3.5 text-sm text-[#F5F3EE] outline-none focus:border-[var(--brand-accent)]"
        />
        {state?.errors?.password && (
          <p className="mt-1 text-xs text-red-400">{state.errors.password[0]}</p>
        )}
      </div>

      {state?.message && <p className="mt-4 text-sm text-red-400">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 h-[46px] rounded-lg bg-[var(--brand-accent)] text-[13px] font-bold tracking-[.12em] text-[#06323A] uppercase transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save new password"}
      </button>
    </form>
  );
}
