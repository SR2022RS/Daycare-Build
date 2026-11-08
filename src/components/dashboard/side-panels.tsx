import Link from "next/link";

import { Panel, PanelEmpty, PanelFooterLink, PanelHeader } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Meter } from "@/components/ui/meter";
import type { OpenShift } from "@/lib/attendance/timecard";
import type { AgingRow } from "@/lib/billing/queries";
import type { ExpiringCredentialEntry } from "@/lib/staff/credentials";
import type { WaitlistGroup } from "@/lib/rooms/queries";

const CRITICAL_EXPIRY_DAYS = 30;

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Who is actually on the floor, replacing a bare "on the clock now" count.
 * A number alone can't tell a director that someone forgot to clock out last
 * night, which is the thing that quietly corrupts a timecard.
 */
export function OnTheFloorPanel({ shifts }: { shifts: OpenShift[] }) {
  const stale = shifts.filter((s) => s.needsCorrection).length;

  return (
    <Panel>
      <PanelHeader
        title="On the floor now"
        subtitle={shifts.length === 0 ? undefined : `${shifts.length} clocked in`}
        right={stale > 0 ? <Pill tone="warn">{stale} to fix</Pill> : undefined}
      />
      {shifts.length === 0 ? (
        <PanelEmpty>Nobody is clocked in.</PanelEmpty>
      ) : (
        <ul className="divide-y divide-gray-100">
          {shifts.map((shift) => (
            <li
              key={shift.attendanceId}
              className="grid grid-cols-[minmax(6rem,1fr)_auto] items-center gap-3 px-4.5 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium text-gray-900">
                  {shift.staffName}
                </div>
                <div className="truncate text-[11.5px] text-gray-400">
                  {shift.locationName ? `${shift.locationName} · ` : ""}since {clockTime(shift.clockInAt)}
                </div>
              </div>
              <span
                className="shrink-0 text-[12.5px] font-semibold tabular-nums"
                style={{ color: shift.needsCorrection ? "var(--signal-warn)" : "var(--signal-muted)" }}
              >
                {shift.hoursOpen.toFixed(1)}h
              </span>
            </li>
          ))}
        </ul>
      )}
      <PanelFooterLink href="/attendance">Open attendance &rarr;</PanelFooterLink>
    </Panel>
  );
}

export function ExpiringPanel({ entries }: { entries: ExpiringCredentialEntry[] }) {
  return (
    <Panel>
      <PanelHeader title="Credentials expiring" subtitle="Within 60 days" />
      {entries.length === 0 ? (
        <PanelEmpty>Nothing expiring soon.</PanelEmpty>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((entry, i) => (
            <li key={`${entry.staffId}-${entry.expiresAt}-${i}`}>
              <Link
                href={`/staff/${entry.staffId}`}
                className="grid grid-cols-[minmax(6rem,1fr)_auto] items-center gap-3 px-4.5 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-gray-900">{entry.name}</div>
                  <div className="truncate text-[11.5px] text-gray-400">{entry.credential}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className="text-[12.5px] font-semibold tabular-nums"
                    style={{
                      color:
                        entry.daysUntil <= CRITICAL_EXPIRY_DAYS
                          ? "var(--signal-critical)"
                          : "var(--signal-warn)",
                    }}
                  >
                    {entry.daysUntil}d
                  </div>
                  <div className="text-[11px] text-gray-400 tabular-nums">{entry.expiresAt}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function OverduePanel({ aging }: { aging: AgingRow[] }) {
  const shown = aging.slice(0, 5);
  const total = aging.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Panel>
      <PanelHeader
        title="Overdue balances"
        subtitle={aging.length === 0 ? undefined : `${aging.length} past due`}
        right={
          aging.length > 0 ? (
            <span className="shrink-0 text-[13px] font-semibold text-gray-900 tabular-nums">
              ${total.toFixed(2)}
            </span>
          ) : undefined
        }
      />
      {aging.length === 0 ? (
        <PanelEmpty>Every family is up to date.</PanelEmpty>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {shown.map((row) => (
              <li key={row.invoiceId}>
                <Link
                  href={`/billing/${row.invoiceId}`}
                  className="grid grid-cols-[minmax(6rem,1fr)_auto] items-center gap-3 px-4.5 py-3 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-gray-900">
                      {row.guardianName}
                    </div>
                    <div className="text-[11.5px] tabular-nums" style={{ color: "var(--signal-warn)" }}>
                      {row.daysOverdue}d overdue
                    </div>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-gray-900 tabular-nums">
                    ${row.amount.toFixed(2)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {aging.length > shown.length && (
            <div className="px-4.5 py-2.5 text-[11.5px] text-gray-400">
              and {aging.length - shown.length} more
            </div>
          )}
        </>
      )}
      <PanelFooterLink href="/billing">Open billing &rarr;</PanelFooterLink>
    </Panel>
  );
}

/**
 * Room occupancy. Seats, not staffing ratio -- a room can sit under capacity
 * and still be out of ratio, and this must not be mistaken for a compliance
 * signal. Ratio tracking is a separate feature.
 */
/**
 * `presentByRoom` is keyed by room id, counting children currently checked
 * in. Enrolled is kept as the secondary figure rather than replaced: enrolled
 * is what the room is sold to, present is what it is running at, and a
 * director reading "6 here / 8 enrolled" learns something neither number
 * carries alone. Rooms with nobody in them show 0 rather than being hidden --
 * an empty room at 10am is exactly the thing worth noticing.
 */
export function OccupancyPanel({
  groups,
  presentByRoom,
}: {
  groups: WaitlistGroup[];
  presentByRoom: Record<string, number>;
}) {
  const rooms = groups.filter((g) => g.roomId !== null);
  const waiting = groups.reduce((sum, g) => sum + g.waiting.length, 0);
  const totalPresent = Object.values(presentByRoom).reduce((sum, n) => sum + n, 0);

  return (
    <Panel>
      <PanelHeader
        title="Rooms & waitlist"
        subtitle={`${totalPresent} here now · seats, not staffing ratio`}
        right={waiting > 0 ? <Pill tone="info">{waiting} waiting</Pill> : undefined}
      />
      {rooms.length === 0 ? (
        <PanelEmpty>No rooms yet. Add rooms in Settings to track capacity.</PanelEmpty>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rooms.map((group) => {
            const { capacity, enrolled, openSpots, isFull } = group.occupancy;
            return (
              <li
                key={group.roomId}
                className="grid grid-cols-[minmax(7rem,1fr)_auto] items-center gap-4 px-4.5 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13.5px] font-medium text-gray-900">
                      {group.roomName}
                    </span>
                    {group.waiting.length > 0 && (
                      <span className="shrink-0 text-[11.5px] text-gray-400">
                        {group.waiting.length} waiting
                      </span>
                    )}
                  </div>
                  <Meter
                    className="mt-1.5"
                    pct={capacity ? (enrolled / capacity) * 100 : 0}
                    tone={isFull ? "warn" : "accent"}
                  />
                </div>
                <span className="shrink-0 text-right text-[12.5px] text-gray-600 tabular-nums">
                  <span className="block font-medium text-gray-900">
                    {presentByRoom[group.roomId!] ?? 0} here
                  </span>
                  <span className="block text-gray-400">
                    {capacity === null ? (
                      <>{enrolled} enrolled · no capacity set</>
                    ) : (
                      <>
                        {enrolled}/{capacity} enrolled
                        {!isFull && openSpots !== null && <> · {openSpots} open</>}
                      </>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <PanelFooterLink href="/waitlist">Open waitlist &rarr;</PanelFooterLink>
    </Panel>
  );
}
