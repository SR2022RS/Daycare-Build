"use client";

import { useActionState } from "react";
import Link from "next/link";

import { login } from "@/lib/auth/actions";

const inputClass =
  "h-11 w-full rounded-lg border border-[var(--brand-accent)]/20 bg-[#17171C] px-3.5 text-sm text-[#F5F3EE] outline-none focus:border-[var(--brand-accent)]";
const labelClass =
  "mb-2 block text-[10.5px] font-semibold tracking-[.18em] text-[#8C857C] uppercase";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div className="flex flex-col">
      <form action={action} className="flex flex-col">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email address
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
          {state?.errors?.email && <p className="mt-1 text-xs text-red-400">{state.errors.email[0]}</p>}
        </div>

        <div className="mt-5">
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
          {state?.errors?.password && <p className="mt-1 text-xs text-red-400">{state.errors.password[0]}</p>}
        </div>

        {state?.message && <p className="mt-4 text-sm text-red-400">{state.message}</p>}

        <div className="mt-5 flex items-center justify-end">
          <Link href="/forgot-password" className="text-[13px] text-[var(--brand-accent)] hover:opacity-80">
            Forgot password
          </Link>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-6 h-[46px] rounded-lg bg-[var(--brand-accent)] text-[13px] font-bold tracking-[.12em] text-[#06323A] uppercase transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-[#7E7871]">
        New staff?{" "}
        <Link href="/signup" className="text-[var(--brand-accent)] hover:opacity-80">
          Create an account
        </Link>
      </p>
    </div>
  );
}
