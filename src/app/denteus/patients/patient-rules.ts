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

/** Empty is fine. Otherwise 8 to 15 digits (E.164 maximum), with only the usual separators around them. */
export const phoneOk = (phone: string): boolean => !phone || (/^[+\d\s().-]+$/.test(phone) && digitsOf(phone).length >= 8 && digitsOf(phone).length <= 15);

/** The next file number: `P-0001`, one above the highest number in use, so a deleted or archived record's number is never reused. */
export function nextPatientNumber(existing: readonly Pick<Patient, 'number'>[]): string {
  const top = Math.max(0, ...existing.map((p) => Number(/^P-(\d+)$/.exec(p.number ?? '')?.[1] ?? 0)));
  return `P-${String(top + 1).padStart(4, '0')}`;
}

/** Empty is fine. Otherwise only the plain coordinate link `https://maps.google.com/?ll=lat,lng` with real coordinates (same rule as the server). */
export function mapUrlOk(url: string): boolean {
  if (!url) return true;
  const m = /^https:\/\/maps\.google\.com\/\?ll=(-?\d{1,3}(?:\.\d{1,10})?),(-?\d{1,3}(?:\.\d{1,10})?)$/.exec(url);
  return !!m && Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180;
}

export type PatientProblem = 'name-required' | 'phone-invalid' | 'email-invalid' | 'birth-invalid' | 'map-invalid' | 'duplicate';

/** Returns the problems by field. An empty object means the input can be saved. */
export function validatePatient(
  input: PatientInput,
  existing: readonly Patient[],
  today: Date,
  selfId?: string,
): Partial<Record<'fullName' | 'phone' | 'emergencyPhone' | 'email' | 'birthDate' | 'mapUrl', PatientProblem>> {
  const problems: Partial<Record<'fullName' | 'phone' | 'emergencyPhone' | 'email' | 'birthDate' | 'mapUrl', PatientProblem>> = {};
  const name = input.fullName.trim();
  const phone = input.phone.trim();

  if (name.length < 2) problems.fullName = 'name-required';

  if (!phoneOk(phone)) problems.phone = 'phone-invalid';
  if (!phoneOk(input.emergencyPhone?.trim() ?? '')) problems.emergencyPhone = 'phone-invalid';

  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) problems.email = 'email-invalid';

  if (!mapUrlOk(input.mapUrl?.trim() ?? '')) problems.mapUrl = 'map-invalid';

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

/** Other patients sharing this phone or email: a hint for the user, never a block (families share a phone). Max 3. */
export function similarPatients(input: Pick<PatientInput, 'phone' | 'email'>, existing: readonly Patient[], selfId?: string): Patient[] {
  const phone = digitsOf(input.phone.trim());
  const email = input.email?.trim().toLowerCase();
  if (phone.length < 6 && !email) return [];
  return existing.filter((p) => p.id !== selfId && ((phone.length >= 6 && digitsOf(p.phone) === phone) || (!!email && p.email?.trim().toLowerCase() === email))).slice(0, 3);
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

/** The ticked conditions a dentist needs to see before treating; translated as `med.<id>`. */
export const CONDITIONS = ['diabetes', 'hypertension', 'heart', 'bloodThinners', 'asthma', 'pregnancy', 'epilepsy', 'kidney', 'liver', 'smoker'] as const;

/** True when the patient has anything the clinic should be warned about. */
export const hasAlert = (p: { alert?: string; medical?: { conditions?: string[]; allergies?: string; medications?: string }; patientAllergies?: { active: boolean; removedAt?: string }[]; patientMedications?: { active: boolean; removedAt?: string }[] }): boolean =>
  !!(p.alert || p.medical?.conditions?.length || p.medical?.allergies || p.medical?.medications || p.patientAllergies?.some((a) => a.active && !a.removedAt) || p.patientMedications?.some((m) => m.active && !m.removedAt));

/** The next version number for a quote, and the list with the unanswered older quote marked as replaced. */
export function addProposal<T extends { version: number; status: string }>(list: T[], make: (version: number) => T): T[] {
  return [...list.map((x) => (x.status === 'proposed' ? { ...x, status: 'superseded' } : x)), make(Math.max(0, ...list.map((x) => x.version)) + 1)];
}
