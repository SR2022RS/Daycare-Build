import Image from "next/image";

export function AuthHero() {
  return (
    <div
      className="relative hidden flex-col justify-between overflow-hidden px-16 py-14 lg:flex"
      style={{
        background:
          "radial-gradient(1px 1px at 18% 22%, rgba(60,192,216,.55), transparent 60%)," +
          "radial-gradient(1px 1px at 64% 14%, rgba(255,255,255,.35), transparent 60%)," +
          "radial-gradient(1.5px 1.5px at 38% 68%, rgba(60,192,216,.35), transparent 60%)," +
          "radial-gradient(1px 1px at 82% 54%, rgba(255,255,255,.22), transparent 60%)," +
          "radial-gradient(1px 1px at 26% 86%, rgba(60,192,216,.3), transparent 60%)," +
          "radial-gradient(1px 1px at 72% 82%, rgba(255,255,255,.18), transparent 60%)," +
          "radial-gradient(120% 90% at 12% 0%, rgba(227,12,123,.45) 0%, rgba(10,10,13,0) 62%)," +
          "#0A0A0D",
      }}
    >
      <div className="flex items-center gap-4.5">
        <Image
          src="/logo/akpa-logo.png"
          alt="Amazin Kids Paradise Academy"
          width={236}
          height={101}
          priority
          className="h-auto w-[180px]"
        />
        <div className="border-l border-[var(--brand-accent)]/30 pl-4.5 leading-tight">
          <div className="font-serif text-[15px] tracking-[.18em] text-[var(--brand-accent)]">
            AKPA UNIVERSITY
          </div>
          <div className="mt-1 text-[10.5px] tracking-[.22em] text-[#6B6560] uppercase">
            Staff &amp; Training System
          </div>
        </div>
      </div>

      <div className="max-w-[520px]">
        <div className="text-[10.5px] font-semibold tracking-[.28em] text-[var(--brand-accent)] uppercase">
          Serving Paterson, New Jersey
        </div>
        <h1 className="mt-5 font-serif text-[46px] leading-[1.14] font-semibold text-[#F5F3EE] text-balance">
          Credentialed care begins with credentialed people.
        </h1>
        <div
          className="my-7 h-px w-[120px]"
          style={{ background: "linear-gradient(90deg, var(--brand-accent), transparent)" }}
        />
        <p className="max-w-[430px] text-[15px] leading-relaxed text-[#9A948C]">
          Coursework, credentials, attendance and policy acknowledgments for every
          classroom, in one record of account.
        </p>
      </div>

      <div />
    </div>
  );
}
