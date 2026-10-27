import type { Patient, PatientInput } from '../models/dental.models';

/** Lowercase and strip accents so "Hélène", "helene" and "HELENE" match. Arabic text passes through unchanged. */
export const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export const digitsOf = (phone: string): string => phone.replace(/\D/g, '');

/** Name or phone. A phone query needs 3+ digits so typing "1" doesn't match everyone. */
export function matchesQuery(patient: Pick<Patient, 'fullName' | 'phone'>, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (normalize(patient.fullName).includes(q)) return true;
  const digits = digitsOf(q);
  return digits.length >= 3 && digitsOf(patient.phone).includes(digits);
}

export type PatientProblem = 'name-required' | 'phone-invalid' | 'email-invalid' | 'birth-invalid' | 'duplicate';

/** Returns the problems by field. An empty object means the input can be saved. */
export function validatePatient(
  input: PatientInput,
  existing: readonly Patient[],
  today: Date,
  selfId?: string,
): Partial<Record<'fullName' | 'phone' | 'email' | 'birthDate', PatientProblem>> {
  const problems: Partial<Record<'fullName' | 'phone' | 'email' | 'birthDate', PatientProblem>> = {};
  const name = input.fullName.trim();
  const phone = input.phone.trim();

  if (name.length < 2) problems.fullName = 'name-required';

  // 8 to 15 digits (E.164 maximum), with only the usual separators around them.
  if (phone && (!/^[+\d\s().-]+$/.test(phone) || digitsOf(phone).length < 8 || digitsOf(phone).length > 15)) {
    problems.phone = 'phone-invalid';
  }

  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) problems.email = 'email-invalid';

  if (input.birthDate) {
    const born = parseIsoDate(input.birthDate);
    if (!born || born > today || ageOn(input.birthDate, today)! > 120) problems.birthDate = 'birth-invalid';
  }

  // Same name and same phone is almost certainly the same person. Same name alone is not (families).
  if (!problems.fullName && phone && !problems.phone) {
    const clash = existing.some(
      (p) => p.id !== selfId && normalize(p.fullName) === normalize(name) && digitsOf(p.phone) === digitsOf(phone),
    );
    if (clash) problems.fullName = 'duplicate';
  }

  return problems;
}

/** `YYYY-MM-DD` to a local Date, or null when it isn't a real calendar day (e.g. 2026-02-31). */
export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** Whole years on a given day, or null without a valid birth date. */
export function ageOn(birthDate: string | undefined, on: Date): number | null {
  const born = birthDate ? parseIsoDate(birthDate) : null;
  if (!born) return null;
  let age = on.getFullYear() - born.getFullYear();
  if (on.getMonth() < born.getMonth() || (on.getMonth() === born.getMonth() && on.getDate() < born.getDate())) age--;
  return age;
}

/** Up to two letters for the avatar: "Amine El Idrissi" gives "AE". */
export function initials(fullName: string): string {
  // Array.from keeps a whole letter together even outside the Latin alphabet.
  const [first, second] = fullName.trim().split(/\s+/).filter(Boolean).map((word) => Array.from(word)[0]);
  return (first ?? '?') + (second ?? '');
}
