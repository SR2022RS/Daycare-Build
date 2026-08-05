"use client";

import { useTransition } from "react";
import { Building2 } from "lucide-react";

import { setActiveLocation } from "@/lib/tenant/actions";

interface Location {
  id: string;
  name: string;
}

export function LocationSwitcher({
  locations,
  activeLocationId,
  canSeeAllLocations,
}: {
  locations: Location[];
  activeLocationId: string | null;
  canSeeAllLocations: boolean;
}) {
  const [, startTransition] = useTransition();

  // A single-location tenant gets a static label, not a dropdown -- no
  // switcher UI for the common case of one center.
  if (locations.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-6 pb-4 text-sm text-white/70">
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="truncate">{locations[0]?.name ?? "No location"}</span>
      </div>
    );
  }

  function handleChange(value: string) {
    const formData = new FormData();
    formData.set("locationId", value);
    startTransition(() => {
      setActiveLocation(formData);
    });
  }

  return (
    <div className="px-4 pb-4">
      <label className="mb-1 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
        <Building2 className="h-3.5 w-3.5" />
        Location
      </label>
      <select
        defaultValue={activeLocationId ?? "all"}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white focus:border-[var(--brand-accent)] focus:outline-none"
      >
        {canSeeAllLocations && <option value="all">All Locations</option>}
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </select>
    </div>
  );
}
