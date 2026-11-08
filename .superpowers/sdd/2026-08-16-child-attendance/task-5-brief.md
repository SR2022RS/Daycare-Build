### Task 5: Kiosk UI

**Files:**
- Modify: `src/components/kiosk/kiosk-client.tsx`
- Modify: `src/app/kiosk/[deviceToken]/page.tsx`

- [ ] **Step 1: Add the mode switch**

The client's state machine is `view: "pad" | "menu" | "incident"`. Add a `"mode"` screen shown first, offering *"I'm staff"* and *"I'm dropping off or picking up"*, then extend `view` with `"guardianPad" | "guardianMenu" | "staffRoster"`. Preserve the existing `IDLE_RESET_MS` idle reset and `CONFIRM_RESET_MS` confirmation behaviour on every new screen — a kiosk left on a child's name is a privacy leak.

- [ ] **Step 2: Guardian screens**

`guardianPad` reuses the existing keypad markup verbatim. `guardianMenu` lists the guardian's children as large touch targets showing present/absent state, each tapping through to check in or out. Use the kiosk class strings from Global Constraints — this screen is used by parents at a door, so targets must be at least `h-16`.

- [ ] **Step 3: Staff roster screen**

Reached from the existing staff menu. Lists the children at the device's location grouped by room, each with an in/out control calling `kioskStaffCheckChild`.

- [ ] **Step 4: Typecheck, build and commit**

Run: `npx tsc --noEmit && npm test && npm run build`

```bash
git add src/components/kiosk/kiosk-client.tsx "src/app/kiosk/[deviceToken]/page.tsx"
git commit -m "Add child check-in/out screens to the kiosk"
```

---

