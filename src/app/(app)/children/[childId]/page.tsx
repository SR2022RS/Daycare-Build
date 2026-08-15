import Link from "next/link";
import { notFound } from "next/navigation";
import { Send, Star } from "lucide-react";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { addGuardian, removeGuardian, setGuardianPayer, updateChild } from "@/lib/children/actions";
import { CADENCE_LABELS, FUNDING_TYPE_LABELS, SCHEDULE_LABELS } from "@/lib/children/labels";
import { createFormSend } from "@/lib/forms/actions";
import { FORM_LIBRARY, formTitle } from "@/lib/forms/definitions";
import { getSiteUrl } from "@/lib/site-url";

export default async function ChildDetailPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const session = await verifySession();

  if (session.profile.role === "staff") {
    return <StaffChildCard childId={childId} tenantId={session.profile.tenantId} />;
  }

  const supabase = await createClient();

  const [{ data: child }, { data: locations }, { data: guardianRows }] = await Promise.all([
    supabase
      .from("children")
      .select(
        "id, full_name, dob, classroom, status, funding_type, schedule, weekly_rate, subsidy_weekly_amount, rate_note, cadence, start_date, location_id",
      )
      .eq("id", childId)
      .eq("tenant_id", session.profile.tenantId)
      .single(),
    supabase
      .from("locations")
      .select("id, name")
      .eq("tenant_id", session.profile.tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("child_guardians")
      .select("guardian_id, relationship, is_payer, guardians(id, full_name, phone, email)")
      .eq("child_id", childId),
  ]);

  if (!child) {
    notFound();
  }

  const { data: sendRows } = await supabase
    .from("form_sends")
    .select("id, form_keys, status, token, sent_at, completed_at, guardians(full_name)")
    .eq("child_id", childId)
    .order("sent_at", { ascending: false });

  const sends = (sendRows ?? []).map((row) => {
    const guardian = Array.isArray(row.guardians) ? row.guardians[0] : row.guardians;
    return { ...row, guardianName: guardian?.full_name ?? "Unknown" };
  });

  const guardians = (guardianRows ?? [])
    .map((row) => {
      const guardian = Array.isArray(row.guardians) ? row.guardians[0] : row.guardians;
      if (!guardian) return null;
      return {
        id: guardian.id,
        fullName: guardian.full_name,
        phone: guardian.phone,
        email: guardian.email,
        relationship: row.relationship,
        isPayer: row.is_payer,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  return (
    <div className="max-w-[1000px]">
      <Link
        href="/children"
        className="mb-3.5 inline-block text-[12.5px] font-semibold text-gray-500 hover:text-[var(--brand-primary)]"
      >
        &larr; Children
      </Link>

      <div className="mb-4 flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)]/10 font-serif text-lg font-semibold text-[var(--brand-primary)]">
          {child.full_name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-xl font-semibold text-gray-900">{child.full_name}</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            DOB {child.dob} &middot; {FUNDING_TYPE_LABELS[child.funding_type]} &middot;{" "}
            {SCHEDULE_LABELS[child.schedule]}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Child &amp; billing details</h2>
          </div>
          <form action={updateChild} className="grid grid-cols-1 gap-2.5 p-4.5 sm:grid-cols-2">
            <input type="hidden" name="childId" value={child.id} />
            <input
              name="fullName"
              defaultValue={child.full_name}
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none sm:col-span-2"
            />
            <label className="flex flex-col text-xs text-gray-500">
              Date of birth
              <input
                type="date"
                name="dob"
                defaultValue={child.dob}
                required
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Location
              <select
                name="locationId"
                defaultValue={child.location_id}
                required
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              >
                {(locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              name="classroom"
              defaultValue={child.classroom ?? ""}
              placeholder="Classroom (optional)"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
            <label className="flex flex-col text-xs text-gray-500">
              Status
              <select
                name="status"
                defaultValue={child.status}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="waitlisted">Waitlisted</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Funding type
              <select
                name="fundingType"
                defaultValue={child.funding_type}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              >
                {Object.entries(FUNDING_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Schedule
              <select
                name="schedule"
                defaultValue={child.schedule}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              >
                {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Weekly rate ($)
              <input
                type="number"
                step="0.01"
                min="0"
                name="weeklyRate"
                defaultValue={child.weekly_rate ?? ""}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Subsidy covers ($/wk)
              <input
                type="number"
                step="0.01"
                min="0"
                name="subsidyWeeklyAmount"
                defaultValue={child.subsidy_weekly_amount ?? ""}
                placeholder="Leave blank for private pay"
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Cadence
              <select
                name="cadence"
                defaultValue={child.cadence}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              >
                {Object.entries(CADENCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Start date
              <input
                type="date"
                name="startDate"
                defaultValue={child.start_date ?? ""}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
            </label>
            <input
              name="rateNote"
              defaultValue={child.rate_note ?? ""}
              placeholder="Rate note (optional — discounts, sibling rate, etc.)"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none sm:col-span-2"
            />
            <button
              type="submit"
              className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 sm:col-span-2"
            >
              Save changes
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4.5 py-3.5">
            <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Guardians</h2>
            <div className="mt-0.5 text-[11.5px] text-gray-400">The starred guardian is billed for this child</div>
          </div>
          <ul className="divide-y divide-gray-100">
            {guardians.map((g) => (
              <li key={g.id} className="px-4.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-gray-900">{g.fullName}</span>
                  {g.relationship && <span className="text-[11.5px] text-gray-400">({g.relationship})</span>}
                  {g.isPayer ? (
                    <Star className="ml-auto h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ) : (
                    <form action={setGuardianPayer} className="ml-auto">
                      <input type="hidden" name="childId" value={child.id} />
                      <input type="hidden" name="guardianId" value={g.id} />
                      <button type="submit" className="text-[11px] font-medium text-gray-400 hover:text-amber-600">
                        Make payer
                      </button>
                    </form>
                  )}
                </div>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  {[g.phone, g.email].filter(Boolean).join(" · ") || "No contact info"}
                </p>
                {g.isPayer && (
                  <Link
                    href={`/billing/guardians/${g.id}`}
                    className="mt-1 inline-block text-[11px] font-semibold text-[var(--brand-primary)] hover:opacity-80"
                  >
                    View billing &rarr;
                  </Link>
                )}
                <form action={removeGuardian} className="mt-1.5">
                  <input type="hidden" name="childId" value={child.id} />
                  <input type="hidden" name="guardianId" value={g.id} />
                  <button type="submit" className="text-[11px] font-medium text-gray-400 hover:text-red-600">
                    Remove
                  </button>
                </form>
              </li>
            ))}
            {guardians.length === 0 && (
              <li className="px-4.5 py-6 text-center text-sm text-gray-500">No guardians on file.</li>
            )}
          </ul>
          <form action={addGuardian} className="flex flex-col gap-2 border-t border-gray-100 px-4.5 py-4">
            <input type="hidden" name="childId" value={child.id} />
            <input
              name="fullName"
              placeholder="Guardian full name"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                name="phone"
                placeholder="Phone"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
              <input
                name="email"
                type="email"
                placeholder="Email"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
            </div>
            <input
              name="relationship"
              placeholder="Relationship (e.g. Mother)"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            />
            <label className="flex items-center gap-2 text-[12.5px] text-gray-600">
              <input type="checkbox" name="isPayer" className="h-3.5 w-3.5" />
              This guardian is billed for the child
            </label>
            <button
              type="submit"
              className="mt-1 self-start rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Add guardian
            </button>
          </form>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Send forms to parent</h2>
          <div className="mt-0.5 text-[11.5px] text-gray-400">
            Parent fills these out online, no account needed &mdash; nothing to print
          </div>
        </div>

        <ul className="divide-y divide-gray-100">
          {sends.map((s) => (
            <li key={s.id} className="px-4.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-gray-900">
                  {s.form_keys.map((k) => formTitle(k)).join(", ")}
                </span>
                <span className="text-[11.5px] text-gray-400">
                  to {s.guardianName} &middot; {s.sent_at.slice(0, 10)}
                </span>
                <span
                  className={`ml-auto rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                    s.status === "completed" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {s.status}
                </span>
              </div>
              {s.status !== "completed" && (
                <p className="mt-1 truncate text-[11.5px] text-gray-400">
                  {getSiteUrl()}/forms/fill/{s.token}
                </p>
              )}
            </li>
          ))}
          {sends.length === 0 && (
            <li className="px-4.5 py-6 text-center text-sm text-gray-500">No forms sent yet.</li>
          )}
        </ul>

        <form action={createFormSend} className="flex flex-col gap-2.5 border-t border-gray-100 px-4.5 py-4">
          <input type="hidden" name="childId" value={child.id} />
          <div className="flex flex-wrap gap-3">
            {FORM_LIBRARY.map((f) => (
              <label key={f.key} className="flex items-start gap-2 text-[12.5px] text-gray-700">
                <input type="checkbox" name="formKeys" value={f.key} className="mt-0.5 h-3.5 w-3.5" />
                <span>
                  <span className="font-medium text-gray-900">{f.title}</span>
                  <br />
                  <span className="text-[11px] text-gray-400">{f.description}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="flex flex-col text-xs text-gray-500">
            Send to
            <select
              name="guardianId"
              required
              defaultValue={guardians.find((g) => g.isPayer)?.id ?? guardians[0]?.id ?? ""}
              className="mt-1 max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
            >
              {guardians.length === 0 && <option value="">Add a guardian first</option>}
              {guardians.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.fullName}
                  {g.isPayer ? " (payer)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={guardians.length === 0}
            className="flex items-center gap-1.5 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> Send
          </button>
        </form>
      </section>
    </div>
  );
}

// Staff see the child's basics and whether the family is behind on payment --
// never amounts. child_balance_status is the only billing surface staff can
// read: public.children RLS restricts select to director/platform_admin, so
// a direct children query returns nothing for staff (fix round 1, Critical
// 1 / Controller Ruling K). The view carries the roster columns staff need
// (full_name, classroom, location_name) alongside balance_status, scoped to
// the caller's tenant by the view's own definition.
async function StaffChildCard({ childId, tenantId }: { childId: string; tenantId: string }) {
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("child_balance_status")
    .select("full_name, classroom, location_name, balance_status")
    .eq("child_id", childId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!child) {
    notFound();
  }

  const overdue = child.balance_status === "overdue";

  return (
    <div className="max-w-[560px]">
      <Link
        href="/children"
        className="mb-3.5 inline-block text-[12.5px] font-semibold text-gray-500 hover:text-[var(--brand-primary)]"
      >
        &larr; Children
      </Link>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4.5 py-3.5">
          <h1 className="font-serif text-[14.5px] font-semibold text-gray-900">{child.full_name}</h1>
          <div className="mt-0.5 text-[11.5px] text-gray-400">
            {child.classroom || "No classroom"} &middot; {child.location_name ?? "—"}
          </div>
        </div>
        <div className="flex items-center justify-between px-4.5 py-3.5">
          <span className="text-[13px] text-gray-600">Account status</span>
          <span
            className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
              overdue ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
            }`}
          >
            {overdue ? "Overdue" : "Current"}
          </span>
        </div>
      </div>
    </div>
  );
}
