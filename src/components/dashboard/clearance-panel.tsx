import Link from "next/link";

import { Panel, PanelEmpty, PanelFooterLink, PanelHeader } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Meter, SplitMeter } from "@/components/ui/meter";
import { CREDENTIAL_SHORT_LABELS, type ClearanceRollup } from "@/lib/staff/credentials";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Solo-supervision readiness.
 *
 * This replaces a list of every uncleared staff member, each row repeating the
 * same 95-character credential string. That layout also collapsed names to
 * "A..", because the long string and the name competed for width and the name
 * had a zero floor.
 *
 * Three questions instead, in the order a director asks them: how far off are
 * we, which credential is the bottleneck, and who is nearly there. Individual
 * names live behind a <details> -- present when wanted, not shouting by
 * default, and no client JS to open it.
 */
export function ClearancePanel({ rollup }: { rollup: ClearanceRollup }) {
  const outstanding = rollup.total - rollup.clearedCount;

  return (
    <Panel>
      <PanelHeader
        title="Solo supervision readiness"
        subtitle="Orientation, CARI and CHRI must all be cleared"
        right={
          <Pill tone={outstanding > 0 ? "critical" : "ok"}>
            {rollup.clearedCount} of {rollup.total} cleared
          </Pill>
        }
      />

      {rollup.total === 0 ? (
        <PanelEmpty>No staff on the roster yet.</PanelEmpty>
      ) : (
        <>
          <div className="px-4.5 pt-4 pb-3.5">
            <SplitMeter
              done={rollup.clearedCount}
              total={rollup.total}
              label={`${rollup.clearedCount} of ${rollup.total} staff cleared for solo supervision`}
            />
          </div>

          {/* Which credential is actually blocking people. Three rows instead
              of one row per person. */}
          <div className="border-t border-gray-100">
            {rollup.perCredential.map((credential) => {
              const clearedFor = rollup.total - credential.missingCount;
              return (
                <div
                  key={credential.type}
                  className="grid grid-cols-[minmax(6rem,1fr)_auto] items-center gap-3 border-b border-gray-100 px-4.5 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-gray-900">
                      {credential.label}
                    </div>
                    <Meter
                      className="mt-1.5"
                      pct={rollup.total > 0 ? (clearedFor / rollup.total) * 100 : 0}
                      tone={credential.missingCount > 0 ? "warn" : "ok"}
                    />
                  </div>
                  <span
                    className="shrink-0 text-[12.5px] font-semibold tabular-nums"
                    style={{
                      color:
                        credential.missingCount > 0
                          ? "var(--signal-critical)"
                          : "var(--signal-ok)",
                    }}
                  >
                    {credential.missingCount > 0 ? `${credential.missingCount} missing` : "All clear"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Everyone missing the same set is one row. */}
          {rollup.groups.length > 0 && (
            <div className="border-t border-gray-100 px-4.5 py-3.5">
              {rollup.groups.map((group) => (
                <details key={group.key} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] text-gray-700 marker:content-none">
                    <span className="font-semibold tabular-nums">{group.staff.length}</span>
                    <span>
                      {group.staff.length === 1 ? "person is" : "people are"} missing{" "}
                      {group.missing.map((m) => CREDENTIAL_SHORT_LABELS[m]).join(" + ")}
                    </span>
                    <span className="ml-auto text-[11.5px] text-gray-400 group-open:hidden">
                      Show names
                    </span>
                    <span className="ml-auto hidden text-[11.5px] text-gray-400 group-open:inline">
                      Hide
                    </span>
                  </summary>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 pb-1">
                    {group.staff.map((person) => (
                      <Link
                        key={person.id}
                        href={`/staff/${person.id}`}
                        title={person.name}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-accent)]/10 text-[10.5px] font-bold text-[var(--brand-primary)] hover:bg-[var(--brand-accent)]/20"
                      >
                        {initials(person.name)}
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* The actionable slice: one document away from clearing. */}
          {rollup.closest.length > 0 && (
            <div className="border-t border-gray-100">
              <div className="px-4.5 pt-3 pb-1.5 text-[10px] font-bold tracking-[.13em] text-gray-400 uppercase">
                Closest to clearing
              </div>
              <ul className="divide-y divide-gray-100">
                {rollup.closest.map((person) => (
                  <li key={person.id}>
                    <Link
                      href={`/staff/${person.id}`}
                      className="grid grid-cols-[minmax(7rem,1fr)_auto] items-center gap-3 px-4.5 py-2.5 hover:bg-gray-50"
                    >
                      <span className="truncate text-[13px] text-gray-900">{person.name}</span>
                      <span className="shrink-0 text-[12px] text-gray-500 tabular-nums">
                        {person.clearedOf}/{person.total} credentials
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <PanelFooterLink href="/staff">Open staff directory &rarr;</PanelFooterLink>
    </Panel>
  );
}
