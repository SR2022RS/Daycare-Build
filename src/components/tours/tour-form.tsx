"use client";

import { useActionState } from "react";

import { submitTourRequest } from "@/lib/tours/actions";
import { HEARD_ABOUT } from "@/lib/tours/labels";

const field =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#6E1F2E] focus:outline-none";

export interface TourCampus {
  id: string;
  name: string;
  address: string | null;
}

export function TourForm({ campuses }: { campuses: TourCampus[] }) {
  const [state, action, pending] = useActionState(submitTourRequest, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-8">
        <h2 className="font-serif text-xl font-semibold text-gray-900">Thank you</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-gray-600">
          We have your tour request. Someone from Amazin Kids Paradise Academy will be in touch.
          This form does not send a text or an email confirmation.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="relative flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-5 py-5">
      {state?.message && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{state.message}</p>
      )}

      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Company website
          <input name="company_website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="text-xs text-gray-500">
        Your name
        <input name="parentName" required autoComplete="name" className={field} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-500">
          Phone
          <input name="phone" required type="tel" autoComplete="tel" className={field} />
        </label>
        <label className="text-xs text-gray-500">
          Email
          <input name="email" required type="email" autoComplete="email" className={field} />
        </label>
      </div>
      <label className="text-xs text-gray-500">
        Child age or ages
        <input name="childAges" required placeholder="2, and 4" className={field} />
      </label>
      <label className="text-xs text-gray-500">
        Desired start date
        <input name="desiredStart" type="date" className={field} />
      </label>
      <label className="text-xs text-gray-500">
        Campus
        <select name="locationId" required defaultValue="" className={field}>
          <option value="" disabled>
            {campuses.length === 0 ? "No campus is open for tours" : "Choose a campus"}
          </option>
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.address ? `${campus.name} — ${campus.address}` : campus.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-500">
        Preferred day and time
        <input name="preferredTime" placeholder="Tuesday morning" className={field} />
      </label>
      <label className="text-xs text-gray-500">
        How did you hear about us?
        <select name="heardAbout" defaultValue="" className={field}>
          <option value="">Choose one</option>
          {HEARD_ABOUT.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-500">
        Notes
        <textarea name="notes" rows={3} className={field} />
      </label>
      <button
        type="submit"
        disabled={pending || campuses.length === 0}
        className="mt-1 self-start rounded-md bg-[#6E1F2E] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Request a tour"}
      </button>
    </form>
  );
}
