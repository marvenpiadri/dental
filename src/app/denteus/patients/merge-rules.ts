import type { Patient } from '../models/dental.models';

type Listed = 'plan' | 'payments' | 'invoices' | 'visits' | 'letters' | 'prescriptions' | 'insurances' | 'proposals' | 'messages' | 'patientAllergies' | 'patientMedications';
const LISTS: readonly Listed[] = ['plan', 'payments', 'invoices', 'visits', 'letters', 'prescriptions', 'insurances', 'proposals', 'messages', 'patientAllergies', 'patientMedications'];
const FILL = ['email', 'birthDate', 'sex', 'country', 'city', 'address', 'mapUrl', 'emergencyName', 'emergencyPhone', 'language', 'referral', 'photo', 'whatsappConsent', 'whatsappConsentAt'] as const;

/**
 * Folds the record `drop` into `keep` (the file that survives): every list is joined, identity fields `keep` lacks are filled from `drop`,
 * the chart and the file number stay `keep`'s, and a note says where the rest came from. Pure: appointments and attached files are moved by the store.
 */
export function mergePatientRecords(keep: Patient, drop: Patient, on: Date): Patient {
  const out: Patient = { ...keep };
  for (const k of LISTS) {
    const a = (keep[k] ?? []) as { id: string }[];
    const b = ((drop[k] ?? []) as { id: string }[]).filter((x) => !a.some((y) => y.id === x.id));
    if (a.length || b.length) (out as unknown as Record<string, unknown>)[k] = [...a, ...b];
  }
  out.examinations = [...(keep.examinations ?? []), ...(drop.examinations ?? []).map((e) => ({ ...e, patientId: keep.id }))].sort((x, y) => x.date.localeCompare(y.date));
  if (!out.examinations.length) delete out.examinations;
  for (const f of FILL) if (out[f] === undefined && drop[f] !== undefined) (out as unknown as Record<string, unknown>)[f] = drop[f];
  if (drop.alert && drop.alert !== keep.alert) out.alert = [keep.alert, drop.alert].filter(Boolean).join(' · ');
  const line = `Merged from ${drop.number ?? drop.id} (${drop.fullName}, ${drop.phone}) on ${on.toISOString().slice(0, 10)}.`;
  out.notes = [keep.notes, drop.notes, line].filter(Boolean).join('\n');
  return out;
}
