import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Password-reset (and other email-OTP) links land here first. Supabase's
// default email templates point at `${siteUrl}/auth/confirm?token_hash=...
// &type=...&next=...` -- this route exchanges that token_hash for a real
// session (via cookies, same as any other server-side Supabase call) and
// only then hands off to `next`, e.g. /reset-password.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/reset-password";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?error=link-expired");
}
