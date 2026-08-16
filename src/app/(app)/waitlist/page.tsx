import Link from "next/link";

import { requireRole } from "@/lib/auth/dal";
import { age } from "@/lib/children/labels";
import { getWaitlist } from "@/lib/rooms/queries";
import { createClient } from "@/lib/supabase/server";
import { EnrollForm } from "@/components/rooms/enroll-form";

export default async function WaitlistPage() {
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const groups = await getWaitlist(supabase, session.profile.tenantId);
  const totalWaiting = groups.reduce((sum, g) => sum + g.waiting.length, 0);

  return (
    <div className="max-w-[1000px]">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold text-gray-900">Waitlist</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {totalWaiting} {totalWaiting === 1 ? "family" : "families"} waiting &middot; seats
            shown are capacity, not staffing ratio
          </p>
        </div>
        <Link
          href="/settings"
          className="text-[12.5px] font-semibold text-[var(--brand-primary)] hover:opacity-80"
        >
          Manage rooms &rarr;
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <section
            key={g.roomId ?? "unassigned"}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 px-4.5 py-3.5">
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">{g.roomName}</h2>
              {g.locationName && (
                <span className="text-[11.5px] text-gray-400">{g.locationName}</span>
              )}
              <span className="text-[13px] text-gray-600 tabular-nums">
                {g.occupancy.capacity === null
                  ? `${g.occupancy.enrolled} enrolled · capacity not set`
                  : `${g.occupancy.enrolled}/${g.occupancy.capacity} enrolled`}
              </span>
              {g.occupancy.capacity !== null && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                    g.occupancy.isFull
                      ? "bg-amber-50 text-amber-700"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  {g.occupancy.isFull
                    ? "Full"
                    : `${g.occupancy.openSpots} open`}
                </span>
              )}
              <span className="ml-auto text-[11.5px] text-gray-400">
                {g.waiting.length} waiting
              </span>
            </div>

            <ul className="divide-y divide-gray-100">
              {g.waiting.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-start gap-3 px-4.5 py-3">
                  <span className="mt-0.5 w-5 shrink-0 text-[12px] font-semibold text-gray-400 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/children/${c.id}`}
                      className="text-[13.5px] font-semibold text-gray-900 hover:text-[var(--brand-primary)]"
                    >
                      {c.fullName}
                    </Link>
                    <div className="mt-0.5 text-[11.5px] text-gray-400">
                      {age(c.dob)}
                      {" · "}
                      {c.daysWaiting === null
                        ? "No waitlist date"
                        : `Waiting ${c.daysWaiting} ${c.daysWaiting === 1 ? "day" : "days"}`}
                      {c.desiredStartDate ? ` · wants ${c.desiredStartDate}` : ""}
                    </div>
                  </div>
                  <EnrollForm
                    childId={c.id}
                    roomId={g.roomId}
                    defaultStartDate={c.desiredStartDate ?? c.nextPeriodStart}
                  />
                </li>
              ))}
              {g.waiting.length === 0 && (
                <li className="px-4.5 py-6 text-center text-sm text-gray-500">
                  Nobody waiting for this room.
                </li>
              )}
            </ul>
          </section>
        ))}

        {groups.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-4.5 py-6 text-center text-sm text-gray-500">
            No rooms yet. Add rooms in Settings to start tracking a waitlist.
          </div>
        )}
      </div>
    </div>
  );
}
