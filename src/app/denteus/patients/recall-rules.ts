import { Appointment, Patient } from '../models/dental.models';

export interface RecallRow { patient: Patient; lastVisit: Date }

/**
 * Patients whose last completed visit is at least `months` old and who have nothing booked ahead.
 * Patients who never had a completed visit are left out: there is nothing to be "due" from.
 * Oldest visit first.
 */
export function recallDue(patients: Patient[], appointments: Appointment[], now: Date, months = 6): RecallRow[] {
  const limit = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  const last = new Map<string, Date>();
  const booked = new Set<string>();
  for (const a of appointments) {
    if (a.status === 'completed' && a.start <= now && (!last.has(a.patientId) || a.start > last.get(a.patientId)!)) last.set(a.patientId, a.start);
    if (a.start > now && a.status !== 'cancelled' && a.status !== 'no-show') booked.add(a.patientId);
  }
  return patients
    .filter((p) => last.has(p.id) && last.get(p.id)! <= limit && !booked.has(p.id))
    .map((patient) => ({ patient, lastVisit: last.get(patient.id)! }))
    .sort((a, b) => a.lastVisit.getTime() - b.lastVisit.getTime());
}
