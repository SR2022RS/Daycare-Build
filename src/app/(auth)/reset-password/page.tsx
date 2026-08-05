import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

// Two link shapes can land here, depending on the Supabase project's email
// template: /auth/confirm (token_hash + verifyOtp) already established a
// session before redirecting here, or an unmodified default template's
// hosted verify redirect lands here directly with `?code=`, which still
// needs exchanging. Either way, a valid session must exist before the form
// below is allowed to render.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect("/login?error=link-expired");
    }
    // Drop the one-time code from the URL before rendering the form.
    redirect("/reset-password");
  }

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    return (
      <div>
        <h2 className="font-serif text-[26px] font-medium text-[#F5F3EE]">Link isn&apos;t available</h2>
        <p className="mt-2.5 mb-8 text-[13.5px] text-[#7E7871]">
          This reset link has expired or was already used. Request a new one to continue.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block h-[46px] rounded-lg bg-[var(--brand-accent)] px-5 text-center text-[13px] leading-[46px] font-bold tracking-[.12em] text-[#06323A] uppercase transition-opacity hover:opacity-90"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-serif text-[26px] font-medium text-[#F5F3EE]">Set a new password</h2>
      <p className="mt-2.5 mb-8 text-[13.5px] text-[#7E7871]">Choose a new password for your account.</p>
      <ResetPasswordForm />
    </div>
  );
}
