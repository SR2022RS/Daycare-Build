"use client";

import { useActionState } from "react";

import { addChildAllergy, removeChildAllergy, saveChildHealth } from "@/lib/children/health-actions";
import {
  ALLERGY_SEVERITIES,
  ALLERGY_SEVERITY_LABELS,
  showsAllergyAlert,
  type ChildHealthView,
} from "@/lib/children/health-model";

const field =
  "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

export function ChildHealthSection({
  childId,
  canEdit,
  health,
  unavailable,
}: {
  childId: string;
  canEdit: boolean;
  health: ChildHealthView | null;
  unavailable: boolean;
}) {
  const allergic =
    health !== null &&
    showsAllergyAlert({ allergyCount: health.allergies.length, allergyNotes: health.allergyNotes });

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4.5 py-3.5">
        <h2 className="text-[15px] font-semibold text-gray-900">Health &amp; allergies</h2>
        <p className="mt-0.5 text-[12.5px] text-gray-500">
          Allergies, asthma, milk alternative, diet, and anything else a teacher needs before the
          day starts.
        </p>
      </div>

      {unavailable || !health ? (
        <p className="bg-amber-50 px-4.5 py-3 text-[13px] text-amber-900">
          Allergy information could not be loaded. Do not treat this child as having no allergies
          until it loads.
        </p>
      ) : (
        <>
          {allergic && (
            <div className="border-b border-red-200 bg-red-50 px-4.5 py-3">
              <p className="text-[11px] font-bold tracking-[.08em] text-red-700 uppercase">
                Allergy alert
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {health.allergies.map((allergy) => (
                  <li key={allergy.id} className="text-[13px] text-red-950">
                    <span className="font-semibold">{allergy.allergen}</span>
                    <span className="text-red-800">
                      {" "}
                      · {ALLERGY_SEVERITY_LABELS[allergy.severity]}
                    </span>
                    {allergy.reaction ? <span className="text-red-800"> · {allergy.reaction}</span> : null}
                    {allergy.actionPlan ? (
                      <span className="block font-semibold text-red-800">Do: {allergy.actionPlan}</span>
                    ) : null}
                  </li>
                ))}
                {health.allergyNotes?.trim() ? (
                  <li className="text-[13px] text-red-950">{health.allergyNotes}</li>
                ) : null}
              </ul>
            </div>
          )}

          {health.hasAsthma && (
            <div className="border-b border-amber-200 bg-amber-50 px-4.5 py-3">
              <p className="text-[11px] font-bold tracking-[.08em] text-amber-800 uppercase">Asthma</p>
              <p className="mt-1 text-[13px] text-amber-950">
                {health.asthmaNotes?.trim() || "Asthma is on file. No plan has been written yet."}
              </p>
            </div>
          )}

          {canEdit ? (
            <Editor childId={childId} health={health} />
          ) : (
            <ReadOnly health={health} />
          )}
        </>
      )}
    </section>
  );
}

function ReadOnly({ health }: { health: ChildHealthView }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Asthma", value: health.hasAsthma ? health.asthmaNotes || "Yes" : "No" },
    { label: "Milk alternative", value: health.milkAlternative },
    { label: "Dietary restrictions", value: health.dietaryRestrictions },
    { label: "Allergy notes", value: health.allergyNotes },
    { label: "Health notes", value: health.healthNotes },
  ];

  return (
    <div className="px-4.5 py-3.5">
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] font-semibold tracking-[.06em] text-gray-400 uppercase">
              {row.label}
            </dt>
            <dd className="mt-0.5 text-[13px] whitespace-pre-wrap text-gray-800">
              {row.value?.trim() || "None on file."}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] text-gray-400">
        View only. A director or site lead can update this.
      </p>
    </div>
  );
}

function Editor({ childId, health }: { childId: string; health: ChildHealthView }) {
  const [state, action, pending] = useActionState(saveChildHealth, undefined);
  const [addState, addAction, addPending] = useActionState(addChildAllergy, undefined);

  return (
    <>
      <form action={action} className="flex flex-col gap-2.5 border-b border-gray-100 px-4.5 py-4">
        <input type="hidden" name="childId" value={childId} />
        {state?.message && <Status message={state.message} ok={state.ok} />}

        <label className="flex items-center gap-2 text-[13px] text-gray-800">
          <input
            type="checkbox"
            name="hasAsthma"
            defaultChecked={health.hasAsthma}
            className="h-3.5 w-3.5"
          />
          Asthma
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Asthma plan / inhaler
          <textarea
            name="asthmaNotes"
            rows={2}
            defaultValue={health.asthmaNotes ?? ""}
            placeholder="Where it is, and when to use it"
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Milk alternative
          <input
            name="milkAlternative"
            defaultValue={health.milkAlternative ?? ""}
            placeholder="Soy, oat, or none"
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Dietary restrictions
          <textarea
            name="dietaryRestrictions"
            rows={2}
            defaultValue={health.dietaryRestrictions ?? ""}
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Allergy notes
          <textarea
            name="allergyNotes"
            rows={2}
            defaultValue={health.allergyNotes ?? ""}
            placeholder="Free-text notes, including anything not split into allergens below"
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Other health notes
          <textarea
            name="healthNotes"
            rows={2}
            defaultValue={health.healthNotes ?? ""}
            className={`mt-1 ${field}`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-1 self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save health details"}
        </button>
      </form>

      <div className="px-4.5 py-3.5">
        <h3 className="text-[13px] font-semibold text-gray-800">Allergens</h3>
        {health.allergies.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-gray-400">No allergens listed yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {health.allergies.map((allergy) => (
              <li key={allergy.id} className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-red-950">{allergy.allergen}</span>
                  <span className="text-[11.5px] text-red-800">
                    {ALLERGY_SEVERITY_LABELS[allergy.severity]}
                  </span>
                  <RemoveAllergy childId={childId} allergyId={allergy.id} />
                </div>
                {allergy.reaction && (
                  <p className="mt-0.5 text-[12.5px] text-red-900">Reaction: {allergy.reaction}</p>
                )}
                {allergy.actionPlan && (
                  <p className="mt-0.5 text-[12.5px] font-semibold text-red-800">
                    Do: {allergy.actionPlan}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form action={addAction} className="flex flex-col gap-2 border-t border-gray-100 px-4.5 py-4">
        <input type="hidden" name="childId" value={childId} />
        {addState?.message && <Status message={addState.message} ok={addState.ok} />}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col text-xs text-gray-500">
            Allergen
            <input name="allergen" required placeholder="Peanuts" className={`mt-1 ${field}`} />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Severity
            <select name="severity" defaultValue="moderate" className={`mt-1 ${field}`}>
              {ALLERGY_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {ALLERGY_SEVERITY_LABELS[severity]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col text-xs text-gray-500">
          Reaction
          <input name="reaction" placeholder="Hives, swelling, wheezing" className={`mt-1 ${field}`} />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Action plan / medication
          <input name="actionPlan" placeholder="EpiPen, inhaler" className={`mt-1 ${field}`} />
        </label>
        <button
          type="submit"
          disabled={addPending}
          className="mt-1 self-start rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {addPending ? "Adding…" : "Add allergen"}
        </button>
      </form>
    </>
  );
}

function RemoveAllergy({ childId, allergyId }: { childId: string; allergyId: string }) {
  const [, action, pending] = useActionState(removeChildAllergy, undefined);

  return (
    <form action={action} className="ml-auto">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="allergyId" value={allergyId} />
      <button
        type="submit"
        disabled={pending}
        className="text-[11px] font-medium text-red-700/70 hover:text-red-800 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
    </form>
  );
}

function Status({ message, ok }: { message: string; ok?: boolean }) {
  return (
    <p
      className={`rounded-md px-3 py-2 text-[12.5px] ${
        ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
      }`}
    >
      {message}
    </p>
  );
}
