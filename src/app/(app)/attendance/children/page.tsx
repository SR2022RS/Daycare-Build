import { verifySession } from "@/lib/auth/dal";
import { getPresentChildren } from "@/lib/attendance/child-presence";
import { createClient } from "@/lib/supabase/server";
import { Panel, PanelEmpty, PanelHeader } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";

// Live board -- an attendance page that renders a cached count of who is in
// the building is worse than no page at all.
export const dynamic = "force-dynamic";

export default async function ChildrenPresentPage() {
  // verifySession, not requireRole: staff running a room are a first-class
  // audience here. The scoping is done by RLS, not by a branch in this file
  // -- child_attendance_select and child_balance_status both apply
  // has_location_access, so the same query returns one site's children to a
  // staff member and every site's to a director.
  const session = await verifySession();
  const supabase = await createClient();

  const board = await getPresentChildren(supabase, session.profile.tenantId);
  const isStaff = session.profile.role === "staff";

  return (
    <div className="max-w-[1000px]">
      <div className="mb-4">
        <h1 className="font-serif text-xl font-semibold text-gray-900">Who&apos;s here</h1>
        <p className="mt-1 text-[13px] text-gray-500">
          {board.total} {board.total === 1 ? "child" : "children"} checked in right now
          {isStaff ? " at your locations" : ""} &middot; children are checked in and out at the kiosk
        </p>
      </div>

      {board.stale.length > 0 && (
        <Panel className="mb-4 border-amber-200">
          <PanelHeader
            title="Still checked in from earlier"
            subtitle="Open more than 12 hours — almost certainly a missed check-out"
            right={<Pill tone="warn">{board.stale.length}</Pill>}
          />
          <ul className="divide-y divide-gray-100">
            {board.stale.map((child) => (
              <li key={child.visitId} className="flex items-center justify-between gap-3 px-4.5 py-2.5">
                <span className="text-[13.5px] text-gray-900">{child.fullName}</span>
                <span className="text-[12.5px] text-gray-500 tabular-nums">
                  {child.roomName} &middot; {child.hoursPresent}h
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {board.rooms.length === 0 ? (
        <Panel>
          <PanelHeader title="Rooms" />
          <PanelEmpty>
            Nobody is checked in yet today. Children appear here the moment a guardian or staff member checks them in
            at the kiosk.
          </PanelEmpty>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {board.rooms.map((group) => (
            <Panel key={group.roomId ?? "unassigned"}>
              <PanelHeader
                title={group.roomName}
                subtitle={group.roomId === null ? "No room assigned, or the room has been closed" : undefined}
                right={
                  <Pill tone="neutral">
                    {group.children.length} {group.children.length === 1 ? "child" : "children"}
                  </Pill>
                }
              />
              <ul className="divide-y divide-gray-100">
                {group.children.map((child) => (
                  <li key={child.visitId} className="flex items-center justify-between gap-3 px-4.5 py-2.5">
                    <span className="text-[13.5px] text-gray-900">{child.fullName}</span>
                    {/* Elapsed hours rather than an arrival clock time: this
                        renders on the server, whose timezone is not the
                        centre's, and a wall-clock time that is four hours out
                        is worse than no time at all. */}
                    <span className="text-[12.5px] text-gray-500 tabular-nums">
                      Here {child.hoursPresent}h
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
