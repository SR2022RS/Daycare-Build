import { AuthHero } from "@/components/brand/auth-hero";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen flex-1 grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
      <AuthHero />
      <div className="flex flex-col justify-center border-l border-[var(--brand-accent)]/15 bg-[#101014] px-8 py-14 sm:px-16">
        <div className="mx-auto w-full max-w-[360px]">{children}</div>
      </div>
    </div>
  );
}
