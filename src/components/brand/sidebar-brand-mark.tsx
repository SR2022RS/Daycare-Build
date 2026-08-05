import Image from "next/image";

const STRIPE_COLORS = ["#E30C7B", "#F0D818", "#3CC0D8", "#489C48", "#FC9024"];

export function SidebarBrandMark({ logoUrl }: { logoUrl: string | null }) {
  return (
    <div
      className="px-4.5 pt-4.5 pb-4"
      style={{
        background:
          "linear-gradient(160deg, color-mix(in srgb, var(--brand-primary) 24%, #0A0A0D) 0%, #0A0A0D 78%)",
        borderBottom: "1px solid color-mix(in srgb, var(--brand-accent) 18%, transparent)",
      }}
    >
      {logoUrl ? (
        <>
          <div className="flex flex-col items-center gap-2 rounded-[10px] bg-white px-3 pt-3 pb-2.5">
            <Image
              src={logoUrl}
              alt="AKPA University"
              width={200}
              height={86}
              priority
              className="h-auto w-full"
            />
            <div className="flex h-[3px] w-full overflow-hidden rounded-full">
              {STRIPE_COLORS.map((c) => (
                <span key={c} className="flex-1" style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="mt-2.5 text-center font-serif text-[10.5px] font-semibold tracking-[.22em] text-[#F5F3EE]/62 uppercase">
            University &middot; Staff &amp; Training
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2.5 px-0.5 py-1">
          <svg width="26" height="31" viewBox="0 0 34 40" fill="none" aria-hidden="true">
            <path
              d="M4 5.5 L8.5 10 L13 3.5 L17 9 L21 3.5 L25.5 10 L30 5.5 L30 13 L4 13 Z"
              stroke="var(--brand-accent)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M4 15 L30 15 L30 26 C30 32.5 24.5 36.2 17 38.5 C9.5 36.2 4 32.5 4 26 Z"
              stroke="var(--brand-accent)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <div className="leading-tight">
            <div className="font-serif text-[12.5px] font-semibold tracking-[.13em] text-[var(--brand-accent)]">
              AKPA UNIVERSITY
            </div>
            <div className="mt-0.5 text-[9px] tracking-[.2em] text-[#F5F3EE]/45 uppercase">
              Staff &amp; Training
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
