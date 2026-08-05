import { submitChildForm } from "@/lib/forms/actions";

const inputClass =
  "mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none";

export function ChildEnrollmentForm({ token }: { token: string }) {
  return (
    <form action={submitChildForm} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="formKey" value="child_enrollment_record" />

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm font-semibold text-gray-900">Child information</legend>
        <input name="childName" placeholder="Child's full name" required className={inputClass} />
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col text-xs text-gray-500">
            Gender
            <input name="gender" className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Date of birth
            <input type="date" name="dob" required className={inputClass} />
          </label>
        </div>
        <input name="homeAddress" placeholder="Home address" required className={inputClass} />
        <input name="homePhone" placeholder="Home phone" className={inputClass} />
      </fieldset>

      {(["Mother/Guardian", "Father/Guardian"] as const).map((label, i) => (
        <fieldset key={label} className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
          <legend className="mb-1 text-sm font-semibold text-gray-900">{label}</legend>
          <input name={`guardian${i + 1}Name`} placeholder={`${label} name`} className={inputClass} />
          <input name={`guardian${i + 1}Address`} placeholder="Address" className={inputClass} />
          <input name={`guardian${i + 1}Email`} type="email" placeholder="Email address" className={inputClass} />
          <div className="grid grid-cols-3 gap-2.5">
            <input name={`guardian${i + 1}HomePhone`} placeholder="Home phone" className={inputClass} />
            <input name={`guardian${i + 1}CellPhone`} placeholder="Cell phone" className={inputClass} />
            <input name={`guardian${i + 1}WorkPhone`} placeholder="Work phone" className={inputClass} />
          </div>
        </fieldset>
      ))}

      <fieldset className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
        <legend className="mb-1 text-sm font-semibold text-gray-900">Attendance</legend>
        <div className="flex flex-wrap gap-3 text-sm text-gray-700">
          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
            <label key={day} className="flex items-center gap-1.5">
              <input type="checkbox" name="attendDays" value={day} className="h-3.5 w-3.5" />
              {day}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col text-xs text-gray-500">
            Time attending
            <input name="timeAttending" placeholder="e.g. 8am - 5pm" className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Starting date
            <input type="date" name="startingDate" className={inputClass} />
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 border-t border-gray-100 pt-4">
        <legend className="mb-1 text-sm font-semibold text-gray-900">Household</legend>
        <div className="grid grid-cols-2 gap-2.5">
          <input name="childResidesWith" placeholder="Child resides with" className={inputClass} />
          <select name="maritalStatus" defaultValue="" className={inputClass}>
            <option value="" disabled>
              Parents&apos; marital status
            </option>
            <option>Married</option>
            <option>Single</option>
            <option>Separated</option>
            <option>Divorced</option>
            <option>Remarried</option>
            <option>Widowed</option>
          </select>
        </div>
        <input name="notAuthorizedPickup" placeholder="Anyone NOT authorized to pick up the child?" className={inputClass} />
        <textarea
          name="allergiesOrConditions"
          placeholder="Allergies or health-related conditions"
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
        Submit enrollment record
      </button>
    </form>
  );
}
