### Task 4: Kiosk server actions

**Files:**
- Modify: `src/lib/kiosk/actions.ts`
- Modify: `src/lib/kiosk/definitions.ts`

**Interfaces:**
- Consumes: `createAdminClient`, the four RPCs from Task 2.
- Produces:
  - `export interface GuardianIdentity { ok: true; sessionToken: string; guardianName: string; children: { id: string; fullName: string; roomName: string | null; present: boolean }[] } | { ok: false; message: string }`
  - `kioskIdentifyGuardian(deviceToken: string, pin: string)`
  - `kioskCheckChildIn(sessionToken: string, childId: string)`
  - `kioskCheckChildOut(sessionToken: string, childId: string)`
  - `kioskStaffCheckChild(sessionToken: string, childId: string, direction: "in" | "out")`

- [ ] **Step 1: Extend the session table usage**

`kiosk_sessions.profile_id` is `not null` and references `profiles`, so a guardian session cannot reuse it as-is. Add to the Task 1 migration pattern a follow-up migration `supabase/migrations/20260817120200_kiosk_guardian_sessions.sql` making `profile_id` nullable, adding `guardian_id uuid references public.guardians (id) on delete cascade`, and a check that exactly one of the two is set. Commit it with this task.

- [ ] **Step 2: Write the guardian actions**

Follow the shape of `kioskIdentify` exactly: regex-gate the PIN, `createAdminClient()`, look up the device by `device_token`, call the RPC, mint a `kiosk_sessions` row, return a session token. Then list that guardian's children with their current presence (`child_attendance` where `checked_out_at is null`).

`kioskCheckChildIn` / `kioskCheckChildOut` resolve the session (reusing the existing private `resolveSession`, extended to return `guardian_id`), verify the child actually belongs to that guardian via `child_guardians`, then call the RPC with `p_guardian_id` set and `p_staff_id` null.

`kioskStaffCheckChild` resolves a *staff* session and calls the RPC with `p_staff_id` set and `p_guardian_id` null, so the row records that staff vouched.

Every one of these must re-verify the relationship server-side. The client sends a `childId`; it must never be trusted.

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/lib/kiosk/actions.ts src/lib/kiosk/definitions.ts supabase/migrations/20260817120200_kiosk_guardian_sessions.sql
git commit -m "Add kiosk actions for guardian identify and child check-in/out

Every action re-verifies server-side that the child belongs to the
guardian holding the session. The client sends a child id and is never
trusted with it."
```

---

