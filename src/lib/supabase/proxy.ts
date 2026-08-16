import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { FUNNEL_HOSTS } from "@/lib/intensive/config";

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
// /kiosk is the shared-tablet time clock -- no login, authorized purely by
// the device token in the URL plus a staff PIN entered on the pad (see
// lib/kiosk/actions.ts). Same reasoning as /forms/fill.
// /intensive is the public sales funnel for the paid owner intensive --
// marketing, so it must be reachable (and indexable) with no account at all.
// Like /forms/fill, a logged-in visitor should still be able to view it.
const PUBLIC_PATHS = [
  ...AUTH_PATHS,
  "/forms/fill",
  "/auth/confirm",
  "/reset-password",
  "/kiosk",
  "/intensive",
  // Stripe posts here server-to-server with no cookie. Without this the
  // proxy would 307 every payment event to /login and seats would silently
  // never be recorded. Authorized by webhook signature, not by session --
  // see app/api/stripe/webhook/route.ts.
  "/api/stripe/webhook",
  // Vercel's cron runner calls this server-to-server with no cookie, so the
  // proxy must not bounce it to /login. Authorized by the CRON_SECRET bearer
  // token it checks itself -- see app/api/cron/intensive-reminders/route.ts.
  // Exact path, not a prefix: "/api/cron/" would silently make every future
  // cron route public at this layer, whether or not it checks a secret.
  "/api/cron/intensive-reminders",
];

// Carved back out of the public tree: /intensive/registrations is the
// director's list of who paid, and it happens to live under a public prefix.
// The page itself calls requireRole() -- this is the second lock, not the
// only one.
const PROTECTED_EXCEPTIONS = ["/intensive/registrations"];

// Defined in lib/intensive/config.ts so the checkout can share the list --
// it doubles as the allowlist for Stripe return URLs.

export async function updateSession(request: NextRequest) {
  // Handled before the Supabase client is built: /intensive is a public,
  // statically-rendered marketing page, so a visitor landing on the funnel
  // domain should not pay for a session lookup to see it.
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (FUNNEL_HOSTS.includes(host) && request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/intensive", request.url));
  }

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
  const isException = PROTECTED_EXCEPTIONS.some((path) => pathname.startsWith(path));
  const isPublicPath = !isException && PUBLIC_PATHS.some((path) => pathname.startsWith(path));
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
