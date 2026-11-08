### Task 3: Types and pure logic

**Files:**
- Modify: `src/types/database.types.ts`
- Create: `src/lib/attendance/child-visits.ts`
- Create: `src/lib/attendance/child-visits.test.ts`

**Interfaces:**
- Produces: `guardian_pins` / `child_attendance` table types; `children.pickup_code_word`; `kiosk_pin_attempts.guardian_id`; and
  - `export interface PresentChild { visitId: string; childId: string; fullName: string; roomId: string | null; roomName: string; checkedInAt: string; hoursPresent: number; }`
  - `export function hoursPresent(checkedInAt: string, now?: Date): number`
  - `export function isStaleVisit(checkedInAt: string, now?: Date): boolean`

- [ ] **Step 1: Add the database types**

Add `guardian_pins` and `child_attendance` to `Tables`, `pickup_code_word: string | null` to `children` Row/Insert, and `guardian_id: string | null` to `kiosk_pin_attempts`. Add the four new functions to the `Functions` block with their exact argument names. `src/types/database.types.ts` is hand-authored and shared — additive changes only, no reformatting.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { hoursPresent, isStaleVisit } from "./child-visits";

const at = (iso: string) => new Date(iso);

describe("hoursPresent", () => {
  it("measures a part-day visit", () => {
    expect(hoursPresent("2026-08-17T08:00:00Z", at("2026-08-17T11:30:00Z"))).toBe(3.5);
  });

  it("rounds to one decimal", () => {
    expect(hoursPresent("2026-08-17T08:00:00Z", at("2026-08-17T08:20:00Z"))).toBe(0.3);
  });

  it("never reports negative time for a clock skew", () => {
    expect(hoursPresent("2026-08-17T09:00:00Z", at("2026-08-17T08:00:00Z"))).toBe(0);
  });
});

describe("isStaleVisit", () => {
  it("accepts a normal day", () => {
    expect(isStaleVisit("2026-08-17T08:00:00Z", at("2026-08-17T17:00:00Z"))).toBe(false);
  });

  it("flags a visit still open after 12 hours", () => {
    // Nobody's child is at daycare for 12 hours; this is a missed check-out,
    // and it must be flagged rather than silently closed.
    expect(isStaleVisit("2026-08-17T07:00:00Z", at("2026-08-17T19:30:00Z"))).toBe(true);
  });

  it("flags a visit left open overnight", () => {
    expect(isStaleVisit("2026-08-17T08:00:00Z", at("2026-08-18T08:00:00Z"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/attendance/child-visits.test.ts`
Expected: FAIL — cannot find module `./child-visits`.

- [ ] **Step 4: Write the implementation**

```ts
/** A visit open longer than this is a missed check-out, not a long day. */
const STALE_VISIT_HOURS = 12;

export interface PresentChild {
  visitId: string;
  childId: string;
  fullName: string;
  roomId: string | null;
  roomName: string;
  checkedInAt: string;
  hoursPresent: number;
}

export function hoursPresent(checkedInAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(checkedInAt).getTime();
  // Clock skew between the kiosk and the server shouldn't render as negative
  // time on a roster a staff member is reading.
  return Math.max(0, Math.round((ms / 3_600_000) * 10) / 10);
}

/**
 * A visit still open after half a day almost certainly means someone forgot to
 * check the child out. It is flagged rather than auto-closed: inventing a
 * departure time would corrupt the very record an audit relies on.
 */
export function isStaleVisit(checkedInAt: string, now: Date = new Date()): boolean {
  return hoursPresent(checkedInAt, now) >= STALE_VISIT_HOURS;
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/lib/attendance/child-visits.test.ts && npx tsc --noEmit`
Expected: 6 tests pass; tsc silent.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts src/lib/attendance/child-visits.ts src/lib/attendance/child-visits.test.ts
git commit -m "Add child visit types and duration helpers"
```

---

