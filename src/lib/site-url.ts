// Resolves the app's own public URL for building absolute links (e.g. auth
// redirect URLs). Falls back through Vercel's automatically-provided
// deployment env vars so preview/production both work without hardcoding a
// domain -- only NEXT_PUBLIC_SITE_URL needs to be set explicitly, and only
// if a custom domain is in use.
export function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
