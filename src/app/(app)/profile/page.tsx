import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { updateMyProfile } from "@/lib/profile/actions";
import { ALL_CREDENTIAL_TYPES, CREDENTIAL_LABELS } from "@/lib/staff/credentials";
import type { CredentialType } from "@/types/database.types";

export default async function ProfilePage() {
  const session = await verifySession();
  const supabase = await createClient();

  const [{ data: profile }, { data: locationRows }, { data: credentials }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone, role, title, is_site_lead").eq("id", session.profile.id).single(),
    supabase.from("staff_locations").select("locations(name)").eq("staff_id", session.profile.id),
    session.profile.role === "staff"
      ? supabase
          .from("staff_credentials")
          .select("credential_type, date_submitted, date_cleared, expires_at")
          .eq("staff_id", session.profile.id)
      : Promise.resolve({ data: [] as { credential_type: CredentialType; date_submitted: string | null; date_cleared: string | null; expires_at: string | null }[] }),
  ]);

  const locations = (locationRows ?? [])
    .map((row) => (Array.isArray(row.locations) ? row.locations[0] : row.locations))
    .filter((l): l is { name: string } => Boolean(l))
    .map((l) => l.name);

  const credentialByType = new Map((credentials ?? []).map((c) => [c.credential_type, c]));

  return (
    <div className="max-w-[700px]">
      <div className="mb-4 flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)]/10 font-serif text-lg font-semibold text-[var(--brand-primary)]">
          {profile?.full_name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-xl font-semibold text-gray-900">{profile?.full_name}</h1>
            {profile?.is_site_lead && (
              <span className="rounded-full bg-[var(--brand-primary)]/10 px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] text-[var(--brand-primary)] uppercase">
                Site lead
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-gray-500">
            {profile?.title || profile?.role} &middot; {locations.join(", ") || "Unassigned"}
          </p>
        </div>
      </div>

      <section className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Contact info</h2>
        </div>
        <form action={updateMyProfile} className="flex flex-col gap-2.5 p-4.5">
          <label className="flex flex-col text-xs text-gray-500">
            Email (managed by your account, not editable here)
            <input
              value={profile?.email ?? ""}
              disabled
              className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Phone
            <input
              name="phone"
              defaultValue={profile?.phone ?? ""}
              placeholder="(555) 555-5555"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
          >
            Save
          </button>
        </form>
      </section>

      {session.profile.role === "staff" && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Credential status</h2>
            <div className="mt-0.5 text-[11.5px] text-gray-400">Read-only &mdash; ask your director to update</div>
          </div>
          <ul className="divide-y divide-gray-100">
            {ALL_CREDENTIAL_TYPES.map((type) => {
              const record = credentialByType.get(type);
              const today = new Date().toISOString().slice(0, 10);
              const isExpired = Boolean(record?.expires_at && record.expires_at < today);
              return (
                <li key={type} className="flex items-center justify-between px-4.5 py-3">
                  <p className="text-[13.5px] font-medium text-gray-900">{CREDENTIAL_LABELS[type]}</p>
                  <p className={`text-[12.5px] ${isExpired ? "font-medium text-red-700" : "text-gray-500"}`}>
                    {record?.date_cleared
                      ? `Cleared ${record.date_cleared}`
                      : record?.date_submitted
                        ? `Submitted ${record.date_submitted}`
                        : "Not on file"}
                    {record?.expires_at ? ` · ${isExpired ? "Expired" : "Expires"} ${record.expires_at}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
