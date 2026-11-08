### Task 8: Dashboard and checklist

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/dashboard/side-panels.tsx`
- Modify: `src/lib/dashboard/attention.ts` and `attention.test.ts`
- Create: `docs/CHILD-ATTENDANCE-APPLY-CHECKLIST.md`

- [ ] **Step 1: Real presence on the dashboard**

`OccupancyPanel` currently counts enrolled children per room. Switch it to present children, keeping enrolled as the secondary figure — "6 here / 8 enrolled" is more useful than either alone. Add a "Children here" metric to the metric bar.

- [ ] **Step 2: Stale visits as an attention item**

Add a branch to `buildAttentionItems` for stale open visits, severity `warn`, mirroring the existing open-shift branch. Add unit tests alongside the existing 11.

- [ ] **Step 3: Write the apply checklist**

Follow `docs/ROOMS-WAITLIST-APPLY-CHECKLIST.md`'s structure. Cover: the three migrations in order; that `guardian_pins` is unreadable by `authenticated` (a direct select must return zero rows / be refused); that all four RPCs are refused when called as `anon` or `authenticated` and succeed only via the kiosk; the one-open-visit unique index (check a child in twice, confirm one row); the check constraints (an insert with both actors set must fail); and a full door walkthrough — issue a guardian PIN, check in at the kiosk, confirm the child appears on "Who's here" and the dashboard, check out, confirm the visit closes.

- [ ] **Step 4: Typecheck, build, commit**

---

## Self-review notes

**Spec coverage:** `guardian_pins` → Task 1, 2, 6; `child_attendance` visit model → Task 1; kiosk guardian path → Tasks 2, 4, 5; staff override path → Tasks 2, 4, 5; live presence → Task 7; dashboard → Task 8; stale-visit flagging → Tasks 3, 8; audit distinction between guardian-authenticated and staff-vouched → the check constraints in Task 1 plus the actor arguments throughout.

**Deliberately deferred to the second plan:** `child_pickup_authorizations`, parsing the pickup form's JSONB, the code-word UI, and the three-tier enforcement rule. `out_override_reason` and `children.pickup_code_word` are created here so the audit trail and the column are in place from the first check-out, but nothing enforces them yet. Check-out currently records who collected a child without validating them — which is exactly what the paper sheet did, and no worse.

**Known risk to watch during execution:** Task 4 discovers that `kiosk_sessions.profile_id` is `not null`. That migration is listed inside Task 4 rather than Task 1 because it is only discoverable once the guardian session flow is written; if execution reorders these, that migration must still land before Task 4's code.
