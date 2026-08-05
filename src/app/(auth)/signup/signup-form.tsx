"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signup } from "@/lib/auth/actions";

const inputClass =
  "h-11 w-full rounded-lg border border-[var(--brand-accent)]/20 bg-[#17171C] px-3.5 text-sm text-[#F5F3EE] outline-none focus:border-[var(--brand-accent)]";
const labelClass =
  "mb-2 block text-[10.5px] font-semibold tracking-[.18em] text-[#8C857C] uppercase";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="flex flex-col">
      <div>
        <label htmlFor="fullName" className={labelClass}>
          Full name
        </label>
        <input id="fullName" name="fullName" autoComplete="name" required className={inputClass} />
        {state?.errors?.fullName && (
          <p className="mt-1 text-xs text-red-400">{state.errors.fullName[0]}</p>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor="email" className={labelClass}>
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
        />
        {state?.errors?.email && (
          <p className="mt-1 text-xs text-red-400">{state.errors.email[0]}</p>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
        {state?.errors?.password && (
          <div className="mt-1 text-xs text-red-400">
            <p>Password must:</p>
            <ul className="list-inside list-disc">
              {state.errors.password.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {state?.message && <p className="mt-4 text-sm text-red-400">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 h-[46px] rounded-lg bg-[var(--brand-accent)] text-[13px] font-bold tracking-[.12em] text-[#06323A] uppercase transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creating account..." : "Sign up"}
      </button>

      <p className="mt-6 text-center text-xs text-[#7E7871]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--brand-accent)] hover:opacity-80">
          Sign in
        </Link>
      </p>
    </form>
  );
}
