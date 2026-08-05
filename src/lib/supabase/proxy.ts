import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Auth pages: unauthenticated visitors get in, but a logged-in user gets
// bounced to /dashboard -- there's no reason to be on /login once signed in.
const AUTH_PATHS = ["/login", "/signup", "/forgot-password"];

// /forms/fill is the parent-facing form-fill link -- no account, no login,
// authorized purely by the unguessable token in the URL (see
// lib/forms/actions.ts). Unlike the auth pages, a logged-in staff member
// (e.g. previewing the link) should NOT be redirected away from it.
//
// /auth/confirm and /reset-password are the password-recovery flow:
// /auth/confirm is hit with no session yet (straight from the email link),
// and /reset-password is hit with a brand-new recovery session that
// verifyOtp just established -- if either were in AUTH_PATHS, the
// user&&isAuthPath bounce below would redirect the visitor to /dashboard
// mid-flow and they'd never reach the "set a new password" form.
const PUBLIC_PATHS = [...AUTH_PATHS, "/forms/fill", "/auth/confirm", "/reset-password"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // With Fluid Compute, don't put this client in a global -- create fresh per request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() -- a mistake
  // here silently breaks session refresh. getClaims() validates the JWT
  // signature; never substitute getSession() for this check (see Next.js
  // auth guide -- getSession() is not guaranteed to revalidate the token).
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const isAuthPath = AUTH_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return supabaseResponse as-is (or copy its cookies onto any
  // replacement response) -- otherwise browser/server session state drifts
  // and users get logged out unexpectedly.
  return supabaseResponse;
}
