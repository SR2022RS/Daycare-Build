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
