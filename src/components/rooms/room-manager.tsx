"use client";

import { useActionState } from "react";

import { saveRoom } from "@/lib/rooms/actions";

export interface RoomRow {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  capacity: number | null;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  isActive: boolean;
  childCount: number;
}

export interface LocationOption {
  id: string;
  name: string;
}

const field =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

/** "18 to 36" reads better on a room card than "18 months to 36 months". */
function ageRange(min: number | null, max: number | null) {
  if (min === null && max === null) return "Any age";
  if (min !== null && max !== null) return `${min}–${max} months`;
  if (min !== null) return `${min}+ months`;
  return `Up to ${max} months`;
}

export function RoomManager({
  rooms,
  locations,
}: {
  rooms: RoomRow[];
  locations: LocationOption[];
}) {
  const [state, action, pending] = useActionState(saveRoom, undefined);

  return (
    <div className="max-w-[900px]">
      <div className="mb-4">
        <h1 className="font-serif text-[18px] font-semibold text-gray-900">Rooms</h1>
        <p className="mt-1 max-w-[560px] text-[13px] text-gray-500">
          A room is what lets the portal tell you it is full before you promise a parent a spot.
          Capacity and age range are what make that possible.
        </p>
      </div>

      {locations.length === 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
          There are no campuses set up yet, so a room has nowhere to go. Add a campus first.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="text-[15px] font-semibold text-gray-900">
              {rooms.length === 0 ? "No rooms yet" : `${rooms.length} rooms`}
            </h2>
          </div>

          <ul className="divide-y divide-gray-100">
            {rooms.map((room) => {
              const full = room.capacity !== null && room.childCount >= room.capacity;
              return (
                <li key={room.id} className="px-4.5 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13.5px] font-semibold text-gray-900">{room.name}</span>
                    <span className="text-[11.5px] text-gray-400">{room.locationName}</span>
                    {!room.isActive && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold tracking-[.06em] text-gray-500 uppercase">
                        Closed
                      </span>
                    )}
                    <span
                      className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                        full ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {room.capacity === null
                        ? `${room.childCount} enrolled`
                        : `${room.childCount} / ${room.capacity}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    {ageRange(room.minAgeMonths, room.maxAgeMonths)}
                  </p>
                </li>
              );
            })}

            {rooms.length === 0 && (
              <li className="px-4.5 py-6 text-center text-sm text-gray-500">
                Add your first room using the form beside this list.
              </li>
            )}
          </ul>
        </section>

        <section className="h-fit overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="text-[15px] font-semibold text-gray-900">Add a room</h2>
          </div>

          <form action={action} className="flex flex-col gap-2.5 px-4.5 py-4">
            {state?.message && (
              <p
                className={`rounded-md px-3 py-2 text-[12.5px] ${
                  state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
                }`}
              >
                {state.message}
              </p>
            )}

            <input name="name" placeholder="Room name (e.g. Butterflies)" required className={field} />

            <label className="flex flex-col text-xs text-gray-500">
              Campus
              <select name="locationId" required defaultValue="" className={`mt-1 ${field}`}>
                <option value="" disabled>
                  Select a campus
                </option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-xs text-gray-500">
              Licensed for (children)
              <input
                type="number"
                min="0"
                step="1"
                name="capacity"
                placeholder="e.g. 12"
                className={`mt-1 ${field}`}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col text-xs text-gray-500">
                Youngest (months)
                <input type="number" min="0" step="1" name="minAgeMonths" className={`mt-1 ${field}`} />
              </label>
              <label className="flex flex-col text-xs text-gray-500">
                Oldest (months)
                <input type="number" min="0" step="1" name="maxAgeMonths" className={`mt-1 ${field}`} />
              </label>
            </div>

            <button
              type="submit"
              disabled={pending || locations.length === 0}
              className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add room"}
            </button>

            <p className="text-[11.5px] text-gray-400">
              Ages are in months so infant rooms can be described precisely — 6 to 18, not “under
              two”.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
