import { redirect } from "next/navigation";

export default function Home() {
  // Unauthenticated requests never reach here -- proxy.ts redirects them to
  // /login before this renders. Authenticated visitors land on /dashboard,
  // which renders the director dashboard or the staff "My day" home.
  redirect("/dashboard");
}
