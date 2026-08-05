// Fixed, well-known id for AKPA's own tenant row (see supabase/seed.sql).
// Public self-service /signup joins this tenant as 'staff' -- there is no
// multi-tenant signup flow yet (that's the platform_admin console, a later
// phase). Promoting a user to 'director' is a direct DB action until an
// admin UI exists.
export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
