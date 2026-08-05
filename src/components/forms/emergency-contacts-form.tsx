import { submitChildForm } from "@/lib/forms/actions";

const inputClass =
  "mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

export function EmergencyContactsForm({ token }: { token: string }) {
  return (
    <form action={submitChildForm} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="formKey" value="emergency_contacts" />

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm font-semibold text-gray-900">Student</legend>
        <input name="studentName" placeholder="Child's full name" required className={inputClass} />
        <div className="grid grid-cols-2 gap-2.5">
          <input type="date" name="birthDate" required className={inputClass} />
          <input name="address" placeholder="Home address" className={inputClass} />
        </div>
      </fieldset>

      {[1, 2].map((n) => (
        <fieldset key={n} className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
          <legend className="mb-1 text-sm font-semibold text-gray-900">Parent/Guardian {n}</legend>
          <div className="grid grid-cols-2 gap-2.5">
            <input name={`guardian${n}Name`} placeholder="Name" className={inputClass} />
            <input name={`guardian${n}Relationship`} placeholder="Relationship to child" className={inputClass} />
          </div>
          <input name={`guardian${n}Address`} placeholder="Address" className={inputClass} />
          <div className="grid grid-cols-2 gap-2.5">
            <input name={`guardian${n}HomePhone`} placeholder="Home phone" className={inputClass} />
            <input name={`guardian${n}CellPhone`} placeholder="Cell phone" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input name={`guardian${n}Email`} type="email" placeholder="Email" className={inputClass} />
            <input name={`guardian${n}PlaceOfWork`} placeholder="Place of work" className={inputClass} />
          </div>
        </fieldset>
      ))}

      {[1, 2, 3].map((n) => (
        <fieldset key={n} className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
          <legend className="mb-1 text-sm font-semibold text-gray-900">Emergency contact {n}</legend>
          <div className="grid grid-cols-2 gap-2.5">
            <input name={`emergencyContact${n}Name`} placeholder="Name" className={inputClass} />
            <input
              name={`emergencyContact${n}Relationship`}
              placeholder="Relationship to child"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input name={`emergencyContact${n}HomePhone`} placeholder="Home phone" className={inputClass} />
            <input name={`emergencyContact${n}CellPhone`} placeholder="Cell phone" className={inputClass} />
          </div>
        </fieldset>
      ))}

      <fieldset className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
        <legend className="mb-1 text-sm font-semibold text-gray-900">Medical information</legend>
        <div className="grid grid-cols-2 gap-2.5">
          <input name="doctorName" placeholder="Child's doctor" className={inputClass} />
          <input name="doctorNumber" placeholder="Doctor's phone number" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <input name="insuranceCard" placeholder="Insurance card #" className={inputClass} />
          <input name="hmo" placeholder="HMO / plan name" className={inputClass} />
        </div>
        <textarea name="allergies" placeholder="Allergies" rows={2} className={inputClass} />
        <textarea name="medicalConditions" placeholder="Medical conditions" rows={2} className={inputClass} />
        <textarea name="medications" placeholder="Current medications" rows={2} className={inputClass} />
      </fieldset>

      <label className="flex flex-col text-xs text-gray-500">
        Your name (person completing this form)
        <input name="submittedByName" required className={inputClass} />
      </label>

      <button
        type="submit"
        className="self-start rounded-md bg-[var(--brand-accent)] px-6 py-2.5 text-sm font-semibold text-[#06323A] hover:opacity-90"
      >
        Submit emergency &amp; medical info
      </button>
    </form>
  );
}
