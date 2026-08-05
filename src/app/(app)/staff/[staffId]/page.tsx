import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createWriteUp, setSiteLead, upsertCredential } from "@/lib/staff/actions";
import {
  ALL_CREDENTIAL_TYPES,
  CREDENTIAL_LABELS,
  getSupervisionClearanceMap,
} from "@/lib/staff/credentials";
import { approveTimecard, correctAttendance } from "@/lib/attendance/actions";
import { addDays, formatMinutes, getMonday, getTimecard, toDatetimeLocal } from "@/lib/attendance/timecard";
import type { CredentialType } from "@/types/database.types";

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { staffId } = await params;
  const { week } = await searchParams;
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : getMonday(new Date());

  const { data: staffMember } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, title, is_site_lead")
    .eq("id", staffId)
    .eq("tenant_id", session.profile.tenantId)
    .single();

  if (!staffMember) {
    notFound();
  }

  const [{ data: progress }, { data: writeUps }, { data: credentials }, { data: locationRows }, clearanceMap, card] =
    await Promise.all([
      supabase
        .from("staff_training_progress")
        .select("status, training_modules(title)")
        .eq("staff_id", staffId),
      supabase
        .from("write_ups")
        .select("id, reason, notes, severity, date")
        .eq("staff_id", staffId)
        .order("date", { ascending: false }),
      supabase
        .from("staff_credentials")
        .select("credential_type, date_submitted, date_cleared, expires_at")
        .eq("staff_id", staffId),
      supabase.from("staff_locations").select("locations(id, name)").eq("staff_id", staffId),
      getSupervisionClearanceMap(supabase, staffMember.role === "staff" ? [staffId] : []),
      getTimecard(supabase, staffId, weekStart),
    ]);

  const completed = progress?.filter((p) => p.status === "completed").length ?? 0;
  const total = progress?.length ?? 0;
  const credentialByType = new Map((credentials ?? []).map((c) => [c.credential_type, c]));
  const isCleared = clearanceMap[staffId];
  const locations = (locationRows ?? [])
    .map((row) => row.locations)
    .filter((l): l is { id: string; name: string } => Boolean(l));
  const defaultLocationId = locations[0]?.id ?? "";

  return (
    <div className="max-w-[1240px]">
      <Link
        href="/staff"
        className="mb-3.5 inline-block text-[12.5px] font-semibold text-gray-500 hover:text-[var(--brand-primary)]"
      >
        &larr; Staff directory
      </Link>

      <div className="flex flex-col items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center">
        <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)]/10 font-serif text-lg font-semibold text-[var(--brand-primary)]">
          {staffMember.full_name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-xl font-semibold text-gray-900">{staffMember.full_name}</h1>
            {staffMember.is_site_lead && (
              <span className="rounded-full bg-[var(--brand-primary)]/10 px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] text-[var(--brand-primary)] uppercase">
                Site lead
              </span>
            )}
            {staffMember.role === "staff" && (
              <span
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.07em] uppercase ${
                  isCleared ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}
              >
                {isCleared ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                {isCleared ? "Cleared" : "Not cleared"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-gray-500">
            {staffMember.title || staffMember.role} &middot;{" "}
            {locations.map((l) => l.name).join(", ") || "Unassigned"} &middot; {staffMember.email}
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="text-[19px] font-semibold text-gray-900 tabular-nums">
              {formatMinutes(card.totalMinutes)}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold tracking-[.13em] text-gray-400 uppercase">
              Hours this week
            </div>
          </div>
          <div>
            <div className="text-[19px] font-semibold text-gray-900 tabular-nums">
              {completed}/{total}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold tracking-[.13em] text-gray-400 uppercase">
              Coursework
            </div>
          </div>
          <div>
            <div
              className={`text-[19px] font-semibold tabular-nums ${
                (writeUps ?? []).length > 0 ? "text-amber-700" : "text-gray-900"
              }`}
            >
              {(writeUps ?? []).length}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold tracking-[.13em] text-gray-400 uppercase">
              Write-ups
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4.5 py-3.5">
              <div>
                <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Timecard</h2>
                <div className="mt-0.5 text-[11.5px] text-gray-400">
                  {formatMinutes(card.totalMinutes)} total
                  {card.otMinutes > 0 ? ` · ${formatMinutes(card.otMinutes)} OT` : ""}
                  {card.approved && " · Approved"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/staff/${staffId}?week=${addDays(weekStart, -7)}`}
                  className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
                >
                  &larr; Prev
                </Link>
                <span className="text-[12px] text-gray-500 tabular-nums">
                  {weekStart} &ndash; {card.weekEnd}
                </span>
                <Link
                  href={`/staff/${staffId}?week=${addDays(weekStart, 7)}`}
                  className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
                >
                  Next &rarr;
                </Link>
                {!card.approved && (
                  <form action={approveTimecard}>
                    <input type="hidden" name="staffId" value={staffId} />
                    <input type="hidden" name="weekStart" value={weekStart} />
                    <button
                      type="submit"
                      className="rounded-md bg-[var(--brand-accent)] px-3 py-1 text-xs font-semibold text-[#06323A] hover:opacity-90"
                    >
                      Approve week
                    </button>
                  </form>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 border-b border-gray-100 bg-gray-50 px-4.5 py-2.5 text-[10px] font-bold tracking-[.13em] text-gray-400 uppercase">
              <span>Date</span>
              <span>Clock in</span>
              <span>Clock out</span>
              <span className="text-right">Total</span>
            </div>
            {card.days.map((d) => (
              <details key={d.date} className="group border-b border-gray-100 last:border-b-0">
                <summary className="grid cursor-pointer grid-cols-4 gap-3 px-4.5 py-2.5 text-[13px] text-gray-700 tabular-nums hover:bg-gray-50">
                  <span className="font-medium text-gray-900">
                    {d.weekday} {d.date}
                  </span>
                  <span>{d.clockIn ?? "—"}</span>
                  <span
                    className={
                      d.needsCorrection
                        ? "font-medium text-red-700"
                        : d.open
                          ? "font-medium text-amber-700"
                          : ""
                    }
                  >
                    {d.needsCorrection ? "Needs correction" : (d.clockOut ?? (d.open ? "On shift" : "—"))}
                  </span>
                  <span className="text-right text-gray-500">
                    {d.totalMinutes > 0 ? formatMinutes(d.totalMinutes) : "—"}
                    {d.edited && <span className="ml-1 text-[10px] text-gray-400">(edited)</span>}
                  </span>
                </summary>
                <form
                  action={correctAttendance}
                  className="flex flex-wrap items-end gap-2 border-t border-gray-100 bg-gray-50 px-4.5 py-3"
                >
                  <input type="hidden" name="staffId" value={staffId} />
                  <input type="hidden" name="date" value={d.date} />
                  <input type="hidden" name="locationId" value={defaultLocationId} />
                  <label className="flex flex-col text-xs text-gray-500">
                    Clock in
                    <input
                      type="datetime-local"
                      name="clockInAt"
                      defaultValue={toDatetimeLocal(d.rawClockInAt)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col text-xs text-gray-500">
                    Clock out
                    <input
                      type="datetime-local"
                      name="clockOutAt"
                      defaultValue={toDatetimeLocal(d.rawClockOutAt)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                    />
                  </label>
                  <label className="flex min-w-[140px] flex-1 flex-col text-xs text-gray-500">
                    Note
                    <input
                      type="text"
                      name="note"
                      defaultValue={d.note ?? ""}
                      placeholder="Reason for correction"
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Save correction
                  </button>
                </form>
              </details>
            ))}
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4.5 py-3.5">
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Write-ups</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {(writeUps ?? []).map((writeUp) => (
                <li key={writeUp.id} className="px-4.5 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[.1em] uppercase ${
                        writeUp.severity === "severe"
                          ? "bg-red-50 text-red-700"
                          : writeUp.severity === "moderate"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {writeUp.severity}
                    </span>
                    <span className="text-[13.5px] font-semibold text-gray-900">{writeUp.reason}</span>
                    <span className="ml-auto text-[11.5px] text-gray-400">{writeUp.date}</span>
                  </div>
                  {writeUp.notes && <p className="mt-1.5 text-[12.5px] text-gray-500">{writeUp.notes}</p>}
                </li>
              ))}
              {(writeUps ?? []).length === 0 && (
                <li className="px-4.5 py-6 text-center text-sm text-gray-500">No write-ups on file.</li>
              )}
            </ul>
            <form action={createWriteUp} className="flex flex-col gap-2 border-t border-gray-100 px-4.5 py-4">
              <input type="hidden" name="staffId" value={staffId} />
              <input
                name="reason"
                placeholder="Reason"
                required
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
              <textarea
                name="notes"
                placeholder="Notes (optional)"
                rows={2}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              />
              <select
                name="severity"
                defaultValue="minor"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
              >
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
              <button
                type="submit"
                className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
              >
                Issue write-up
              </button>
            </form>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4.5 py-3.5">
              <h2 className="font-serif text-[14.5px] font-semibold text-gray-900">Credentials</h2>
              <div className="mt-0.5 text-[11.5px] text-gray-400">Submitted, cleared, expires</div>
            </div>
            <ul className="divide-y divide-gray-100">
              {ALL_CREDENTIAL_TYPES.map((type) => (
                <CredentialRow key={type} staffId={staffId} type={type} record={credentialByType.get(type)} />
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4.5">
            <h2 className="mb-3 font-serif text-[14.5px] font-semibold text-gray-900">
              Location assignment
            </h2>
            <div className="flex flex-wrap gap-2">
              {locations.map((l, i) => (
                <span
                  key={l.id}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${
                    i === 0
                      ? "bg-[var(--brand-primary)] text-white"
                      : "border border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {l.name}
                </span>
              ))}
              {locations.length === 0 && <span className="text-sm text-gray-500">No locations assigned.</span>}
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-gray-400">
              Classroom and ratio assignment are deferred to the children &amp; classroom module &mdash; not
              in this schema.
            </p>
          </section>

          {staffMember.role === "staff" && (
            <section className="rounded-xl border border-gray-200 bg-white p-4.5">
              <h2 className="mb-1 font-serif text-[14.5px] font-semibold text-gray-900">Site lead</h2>
              <p className="mb-3 text-[11.5px] leading-relaxed text-gray-400">
                Adds location-scoped powers on top of the staff role: a staff directory limited to their
                assigned location(s), and (once incident reports ship) the sign-off queue for their site.
              </p>
              <form action={setSiteLead} className="flex items-center gap-3">
                <input type="hidden" name="staffId" value={staffId} />
                <input
                  type="checkbox"
                  id="isSiteLead"
                  name="isSiteLead"
                  defaultChecked={staffMember.is_site_lead}
                  className="h-3.5 w-3.5"
                />
                <label htmlFor="isSiteLead" className="text-[12.5px] text-gray-600">
                  Site lead (alpha staff) at their assigned location(s)
                </label>
                <button
                  type="submit"
                  className="ml-auto rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Save
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

interface CredentialRecord {
  credential_type: CredentialType;
  date_submitted: string | null;
  date_cleared: string | null;
  expires_at: string | null;
}

function CredentialRow({
  staffId,
  type,
  record,
}: {
  staffId: string;
  type: CredentialType;
  record?: CredentialRecord;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isExpired = Boolean(record?.expires_at && record.expires_at < today);

  return (
    <li className="px-4.5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium text-gray-900">{CREDENTIAL_LABELS[type]}</p>
        {record?.expires_at && (
          <span className={`text-xs ${isExpired ? "font-medium text-red-700" : "text-gray-500"}`}>
            {isExpired ? "Expired" : "Expires"} {record.expires_at}
          </span>
        )}
      </div>
      <form action={upsertCredential} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="staffId" value={staffId} />
        <input type="hidden" name="credentialType" value={type} />
        <label className="flex flex-col text-xs text-gray-500">
          Submitted
          <input
            type="date"
            name="dateSubmitted"
            defaultValue={record?.date_submitted ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Cleared
          <input
            type="date"
            name="dateCleared"
            defaultValue={record?.date_cleared ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Save
        </button>
      </form>
    </li>
  );
}
