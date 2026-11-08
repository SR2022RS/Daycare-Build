export type KioskIdentifyResult =
  | {
      ok: true;
      sessionToken: string;
      fullName: string;
      clockedIn: boolean;
      onBreak: boolean;
      rooms: { id: string; name: string }[];
    }
  | { ok: false; message: string };

export type KioskActionResult = { ok: boolean; message: string };

export type GuardianIdentity =
  | {
      ok: true;
      sessionToken: string;
      guardianName: string;
      children: { id: string; fullName: string; roomName: string | null; present: boolean }[];
    }
  | { ok: false; message: string };

export type StaffRosterResult =
  | {
      ok: true;
      rooms: { id: string; name: string; children: { id: string; fullName: string; present: boolean }[] }[];
      unassigned: { id: string; fullName: string; present: boolean }[];
    }
  | { ok: false; message: string };
