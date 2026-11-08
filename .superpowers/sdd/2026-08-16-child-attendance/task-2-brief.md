### Task 2: Kiosk RPCs

**Files:**
- Create: `supabase/migrations/20260817120100_child_attendance_rpcs.sql`

**Interfaces:**
- Produces: `admin_set_guardian_pin(uuid, text)`, `kiosk_identify_guardian_pin(uuid, text)`, `kiosk_check_child_in(uuid, uuid, uuid, uuid)`, `kiosk_check_child_out(uuid, uuid, uuid, text)`.

- [ ] **Step 1: Read the functions being mirrored**

Read `kiosk_identify_pin` and `admin_set_staff_pin` in `supabase/migrations/20260813090000_kiosk_access.sql` in full. Reproduce their structure: `select ... for update` on the device, lockout check, PIN regex gate, candidate loop with `crypt`, attempt logging, and the exact revoke/grant lines.

- [ ] **Step 2: Write the migration**

Reproduce the four functions below. Match the existing files' comment banners.

`admin_set_guardian_pin(p_guardian_id uuid, p_pin text) returns void` — plpgsql, `security definer`, `set search_path = public, extensions`. Mirrors `admin_set_staff_pin`: refuse unless `current_role()` is director/platform_admin; gate `p_pin !~ '^[0-9]{4,6}$'` with `raise exception 'PIN must be 4 to 6 digits'`; verify the guardian's `tenant_id` matches `current_tenant_id()`; scan the tenant's other guardian PINs for a collision and `raise exception 'pin_taken'`; upsert `on conflict (guardian_id) do update`.
Grants: `revoke all on function public.admin_set_guardian_pin(uuid, text) from public, anon;` then `grant execute ... to authenticated;`

`kiosk_identify_guardian_pin(p_device_token uuid, p_pin text) returns uuid` — plpgsql, `security definer`, `set search_path = public, extensions`. Mirrors `kiosk_identify_pin`, with one difference in candidate scoping: staff are scoped by `staff_locations`, but guardians have no location link, so scope by **tenant plus having at least one child at the device's location**:

```sql
for r in (
  select gp.guardian_id, gp.pin_hash
  from public.guardian_pins gp
  where gp.tenant_id = v_device.tenant_id
    and exists (
      select 1
      from public.child_guardians cg
      join public.children c on c.id = cg.child_id
      where cg.guardian_id = gp.guardian_id
        and c.location_id = v_device.location_id
        and c.status = 'active'
    )
) loop
  if crypt(p_pin, r.pin_hash) = r.pin_hash then v_match := r.guardian_id; exit; end if;
end loop;
```

Reuse `kiosk_devices.failed_attempts` / `locked_until` for lockout (device-scoped, same as staff) and log to `kiosk_pin_attempts` setting the new `guardian_id` column.
Grants: `revoke all on function public.kiosk_identify_guardian_pin(uuid, text) from public, anon, authenticated;` then `grant execute ... to service_role;`

`kiosk_check_child_in(p_child_id uuid, p_room_id uuid, p_guardian_id uuid, p_staff_id uuid) returns uuid` — plpgsql, `security definer`, `set search_path = public`. Rejects unless the child is `status = 'active'`. Resolves `room_id` from the argument, falling back to `children.room_id`. If an open visit already exists, returns its id unchanged (idempotent — a second tap must not create a second visit). Otherwise inserts and returns the new id. Raises if both or neither actor argument is null.
Grants: `revoke ... from public, anon, authenticated;` `grant execute ... to service_role;`

`kiosk_check_child_out(p_child_id uuid, p_guardian_id uuid, p_staff_id uuid, p_override_reason text) returns uuid` — same shape. Finds the open visit; raises a distinguishable `no_open_visit` exception if there is none; sets `checked_out_at = now()` and the actor. Same grants.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260817120100_child_attendance_rpcs.sql
git commit -m "Add kiosk RPCs for guardian PIN and child check-in/out

Mirrors the staff kiosk exactly: revoked from anon and authenticated,
granted only to service_role, and reached solely through the device
token plus the admin client. No RPC in this codebase is callable by
anon, and these are no exception.

Guardian candidates are scoped by tenant plus having an active child at
the device's location -- guardians have no staff_locations row to scope
by, and an unscoped candidate loop would be a tenant-wide PIN oracle."
```

---

