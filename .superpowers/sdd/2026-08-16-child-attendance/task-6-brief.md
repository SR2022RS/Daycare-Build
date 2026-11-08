### Task 6: Guardian PIN management

**Files:**
- Modify: `src/lib/children/actions.ts`
- Modify: `src/app/(app)/children/[childId]/page.tsx`

- [ ] **Step 1: Add the action**

`resetGuardianPin(_state, formData)` in `src/lib/children/actions.ts`, following `resetStaffPin` in `src/lib/kiosk/actions.ts` exactly — including its `useActionState` signature, since it must return the generated plaintext PIN once for the director to hand over, and its retry loop on the `pin_taken` exception.

- [ ] **Step 2: Add the control**

The guardian `<li>` in the child detail page already holds "Make payer" and "Remove" forms styled `"text-[11px] font-medium text-gray-400 hover:..."`. Add a third control in the same row for issuing or resetting a kiosk PIN, and render the returned PIN prominently and once, with wording making clear it will not be shown again.

- [ ] **Step 3: Typecheck and commit**

```bash
git add src/lib/children/actions.ts "src/app/(app)/children/[childId]/page.tsx"
git commit -m "Let directors issue guardian kiosk PINs from the child page

Guardian PINs sit with the family rather than in Settings: a director
issuing one is already looking at that child's record."
```

---

