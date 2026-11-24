/** A filled honeypot is a bot. Humans never see the field. */
export function honeypotTripped(value: FormDataEntryValue | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function plausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function plausiblePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
