import Link from "next/link";

/**
 * The one CTA on the funnel. Every instance points at the same route, so it
 * is a real link -- middle-click, long-press and "open in new tab" all work,
 * which a button-with-onClick would have broken.
 */
export function CtaButton({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href="/intensive/checkout"
      className={`intensive-cta flex h-[58px] w-full items-center justify-center rounded-[10px] font-serif text-base font-bold tracking-[.06em] text-white ${className}`}
    >
      {children}
    </Link>
  );
}
