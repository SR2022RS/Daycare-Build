import { submitChildForm } from "@/lib/forms/actions";

const inputClass =
  "mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

export function PickupAuthorizationForm({ token }: { token: string }) {
  return (
    <form action={submitChildForm} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="formKey" value="pickup_authorization" />

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm font-semibold text-gray-900">Child &amp; primary guardian</legend>
        <div className="grid grid-cols-2 gap-2.5">
          <input name="childName" placeholder="Child's full name" required className={inputClass} />
          <input type="date" name="dob" required className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <input name="guardianName" placeholder="Guardian's name" className={inputClass} />
          <input name="guardianPhone" placeholder="Phone number" className={inputClass} />
        </div>
        <input name="address" placeholder="Address" className={inputClass} />
        <label className="flex flex-col text-xs text-gray-500">
          Code word (shown to anyone unfamiliar to staff before release, per policy)
          <input name="codeWord" required className={inputClass} />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
        <legend className="mb-1 text-sm font-semibold text-gray-900">
          Additional people who may pick up the child
        </legend>
        {[1, 2, 3].map((n) => (
          <div key={n} className="grid grid-cols-3 gap-2.5">
            <input name={`person${n}Name`} placeholder={`Name ${n}`} className={inputClass} />
            <input name={`person${n}Relation`} placeholder="Relation to child" className={inputClass} />
            <input name={`person${n}Phone`} placeholder="Phone number" className={inputClass} />
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
        <legend className="mb-1 text-sm font-semibold text-gray-900">Not authorized to pick up</legend>
        <textarea
          name="notAuthorized"
          placeholder="Names of anyone who should NOT be allowed to pick up this child"
          rows={2}
          className={inputClass}
        />
      </fieldset>

      <label className="flex flex-col text-xs text-gray-500">
        Your name (person completing this form)
        <input name="submittedByName" required className={inputClass} />
      </label>

      <button
        type="submit"
        className="self-start rounded-md bg-[var(--brand-accent)] px-6 py-2.5 text-sm font-semibold text-[#06323A] hover:opacity-90"
      >
        Submit pickup authorization
      </button>
    </form>
  );
}
