"use client";

import { useMemo, useState } from "react";

import { PAYMENT_STATUS_LABELS, type Registration } from "@/lib/intensive/definitions";

const STATUS_STYLES: Record<Registration["status"], string> = {
  paid: "text-[#3E8E41] bg-[#EDF7ED]",
  pending: "text-[#B4530A] bg-[#FFF6EC]",
  refunded: "text-[#64748B] bg-[#F1F5F9]",
  failed: "text-[#B42318] bg-[#FEF3F2]",
};

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
    cents / 100,
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RegistrationsTable({ rows }: { rows: Registration[] }) {
  const [query, setQuery] = useState("");
  const [exported, setExported] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Exports exactly what is on screen, so a filtered view exports the
  // filtered set -- exporting 400 rows after searching for one name is the
  // usual way this surprises people.
  function exportCsv() {
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ["First name", "Last name", "Email", "Amount", "Status", "Registered"];
    const body = filtered.map((r) =>
      [
        r.firstName,
        r.lastName,
        r.email,
        (r.amountCents / 100).toFixed(2),
        PAYMENT_STATUS_LABELS[r.status],
        shortDate(r.createdAt),
      ]
        .map(escape)
        .join(","),
    );

    const csv = [header.map(escape).join(","), ...body].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "intensive-registrations.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#E6E9EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,.05)]">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF1F5] px-[18px] py-3.5">
        <label htmlFor="reg-search" className="sr-only">
          Search registrations by name or email
        </label>
        <input
          id="reg-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email"
          className="h-[34px] min-w-[200px] max-w-[300px] flex-1 rounded-lg border border-[#E2E6EC] px-3 text-[13px] text-[#0F172A] outline-none focus:border-brand-accent"
        />
        <span className="ml-auto text-xs text-[#64748B]">
          Showing {filtered.length} of {rows.length}
        </span>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="h-[34px] shrink-0 rounded-lg border border-[#E2E6EC] px-3.5 text-[13px] font-semibold text-[#475569] hover:border-brand-primary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#E2E6EC] disabled:hover:text-[#475569]"
        >
          {exported ? "CSV downloaded ✓" : "Export CSV"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="px-[18px] py-12 text-center">
          {rows.length === 0 ? (
            <>
              <p className="text-sm font-semibold text-[#334155]">No registrations yet</p>
              <p className="mt-1.5 text-[13px] text-[#64748B]">
                Seats appear here the moment a payment clears — the webhook writes the row, not the
                browser.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-[#334155]">
                No registrations match that search
              </p>
              <p className="mt-1.5 text-[13px] text-[#64748B]">
                Try a partial name, or clear the field to see everyone.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: a real grid. Mobile: stacked cards -- five columns of
              email addresses on a phone is unreadable. */}
          <div className="hidden grid-cols-[1.9fr_2fr_1fr_1.1fr_1.2fr] gap-3 border-b border-[#EEF1F5] bg-[#FAFBFC] px-[18px] py-2.5 text-[10px] font-bold uppercase tracking-[.13em] text-[#64748B] md:grid">
            <span>Name</span>
            <span>Email</span>
            <span>Amount</span>
            <span>Status</span>
            <span className="text-right">Registered</span>
          </div>

          <ul>
            {filtered.map((r) => (
              <li key={r.id} className="border-b border-[#F3F5F8] last:border-b-0">
                <div className="hidden grid-cols-[1.9fr_2fr_1fr_1.1fr_1.2fr] items-center gap-3 px-[18px] py-3.5 hover:bg-[#FBFCFD] md:grid">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#FDE7F1] text-[10.5px] font-bold text-[#B00A5F]"
                    >
                      {initials(r.firstName, r.lastName)}
                    </span>
                    <span className="truncate text-[13.5px] font-semibold text-[#0F172A]">
                      {r.firstName} {r.lastName}
                    </span>
                  </div>
                  <span className="truncate text-[13px] text-[#64748B]">{r.email}</span>
                  <span className="text-[13px] tabular-nums text-[#334155]">
                    {money(r.amountCents, r.currency)}
                  </span>
                  <span
                    className={`justify-self-start rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.07em] ${STATUS_STYLES[r.status]}`}
                  >
                    {PAYMENT_STATUS_LABELS[r.status]}
                  </span>
                  <span className="text-right text-[12.5px] tabular-nums text-[#64748B]">
                    {shortDate(r.createdAt)}
                  </span>
                </div>

                <div className="flex flex-col gap-2.5 px-4 py-3.5 md:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FDE7F1] text-[11px] font-bold text-[#B00A5F]"
                    >
                      {initials(r.firstName, r.lastName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold leading-tight text-[#0F172A]">
                        {r.firstName} {r.lastName}
                      </p>
                      <p className="mt-0.5 break-words text-[13px] leading-snug text-[#64748B]">
                        {r.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 pl-11">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.07em] ${STATUS_STYLES[r.status]}`}
                    >
                      {PAYMENT_STATUS_LABELS[r.status]}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-[#334155]">
                      {money(r.amountCents, r.currency)}
                    </span>
                    <span className="text-[12.5px] tabular-nums text-[#64748B]">
                      {shortDate(r.createdAt)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
