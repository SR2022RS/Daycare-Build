import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { INTENSIVE } from "@/lib/intensive/config";
import { CheckoutForm } from "@/components/intensive/checkout-form";

export const metadata: Metadata = {
  title: `Reserve your seat — ${INTENSIVE.name}`,
  description: `Register for ${INTENSIVE.name}.`,
  // A checkout step has nothing to offer a search result, and indexing it
  // would put people into the funnel halfway through.
  robots: { index: false, follow: true },
};

export default async function IntensiveCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  // Between sessions there is nothing to buy. Anyone arriving here from an old
  // link, a bookmark or a shared post goes to the waitlist instead of a
  // checkout that would charge them for a session that has already run.
  if (INTENSIVE.registration === "waitlist") redirect("/intensive#waitlist");

  const { cancelled } = await searchParams;

  return (
    <div className="min-h-screen bg-brand-ink px-6 pt-9 pb-16">
      <div className="mx-auto max-w-[480px]">
        <Link
          href="/intensive"
          className="mb-[22px] inline-block text-[13px] font-medium text-[#8C857C] hover:text-brand-primary"
        >
          ← Back to the details
        </Link>

        <CheckoutForm cancelled={cancelled === "1"} />
      </div>
    </div>
  );
}
