"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { getSiteUrl } from "@/lib/site-url";
import { AuthFormState, LoginFormSchema, NewPasswordFormSchema, SignupFormSchema } from "@/lib/auth/definitions";

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const validated = LoginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(validated.data);

  if (error) {
    return { message: "Invalid email or password." };
  }

  redirect("/dashboard");
}

export async function signup(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const validated = SignupFormSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { fullName, email, password } = validated.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        tenant_id: DEFAULT_TENANT_ID,
        role: "staff",
      },
    },
  });

  if (error) {
    return { message: error.message };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return { message: "Please enter your email." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/reset-password`,
  });

  // Always return the same message regardless of whether the email exists,
  // to avoid leaking which emails have accounts.
  return { message: "If an account exists for that email, a reset link has been sent." };
}

// Only reachable with a valid recovery session -- established by
// src/app/(auth)/reset-password/page.tsx before this form ever renders
// (via /auth/confirm's verifyOtp, or a `code` exchange for an
// unmodified default email template). updateUser() writes through that
// session's cookies, same as any other authenticated server call.
export async function updatePassword(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = NewPasswordFormSchema.safeParse({
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: validated.data.password });

  if (error) {
    return { message: error.message };
  }

  redirect("/dashboard");
}
