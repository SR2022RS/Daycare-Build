### Task 7: Who's here

**Files:**
- Create: `src/lib/attendance/child-presence.ts`
- Create: `src/app/(app)/attendance/children/page.tsx`
- Modify: `src/lib/nav/nav-items.ts`

**Interfaces:**
- Produces: `getPresentChildren(supabase, tenantId)` → `{ rooms: { roomId: string | null; roomName: string; children: PresentChild[] }[]; total: number; stale: PresentChild[] }`

- [ ] **Step 1: Write the query**

Group open visits by room, mirroring `getWaitlist` in `src/lib/rooms/queries.ts` — including its handling of children whose room is null or soft-deactivated, which must fall into "Unassigned" rather than vanishing. Flag stale visits with `isStaleVisit`.

- [ ] **Step 2: Build the page**

Reuse `Panel`, `PanelHeader`, `PanelEmpty` from `@/components/ui/panel` and `Pill` from `@/components/ui/pill`. Gate with `verifySession()` and a role branch — staff see their own locations via the RLS policy from Task 1; directors see everything.

- [ ] **Step 3: Add the nav entry**

Add "Who's here" under the existing `Children` section for director/platform_admin, and to the staff branch's `My work` section — staff running a room genuinely need this one.

- [ ] **Step 4: Typecheck, build and commit**

---

