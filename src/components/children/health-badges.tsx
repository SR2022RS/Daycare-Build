export function AllergyBadge({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={
        onDark
          ? "shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold tracking-[.08em] text-red-300 uppercase"
          : "shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] text-red-700 uppercase"
      }
    >
      Allergy
    </span>
  );
}

export function AsthmaBadge({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={
        onDark
          ? "shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold tracking-[.08em] text-amber-200 uppercase"
          : "shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] text-amber-800 uppercase"
      }
    >
      Asthma
    </span>
  );
}

/** Shown when the read failed. A missing badge must not be read as "none". */
export function AllergyUnknownBadge() {
  return (
    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] text-amber-800 uppercase">
      Allergy unknown
    </span>
  );
}
