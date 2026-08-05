// The fillable-form library. Each entry traces to a specific page of AKPA's
// original paper packet (akpa1scanner_20260709_114928.pdf) -- field shapes
// mirror the paper form so nothing gets lost in translation.

export const FORM_LIBRARY = [
  {
    key: "child_enrollment_record",
    title: "Child Enrollment Record",
    description: "Child info, parent/guardian contacts, attendance days, allergies (source: p.6)",
  },
  {
    key: "emergency_contacts",
    title: "Emergency Contacts & Medical Info",
    description: "Up to 3 emergency contacts, physician, insurance, allergies (source: p.10)",
  },
  {
    key: "pickup_authorization",
    title: "Child Pickup Authorization",
    description: "Authorized pickup people, code word, not-authorized list (source: p.11)",
  },
] as const;

export type FormKey = (typeof FORM_LIBRARY)[number]["key"];

export const FORM_KEYS: FormKey[] = FORM_LIBRARY.map((f) => f.key);

export function isFormKey(value: string): value is FormKey {
  return (FORM_KEYS as string[]).includes(value);
}

export function formTitle(key: string): string {
  return FORM_LIBRARY.find((f) => f.key === key)?.title ?? key;
}
