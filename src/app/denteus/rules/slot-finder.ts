import type { Appointment } from '../models/dental.models';
import { findConflicts } from './scheduling-rules';

/** shortcut: fixed 09:00–18:00, Monday–Saturday, until clinic opening hours are modelled (multi-site work). */
export const DAY_START_MIN = 9 * 60;
export const DAY_END_MIN = 18 * 60;
export const SLOT_STEP_MIN = 15;

export interface SlotQuery {
  dentistId: string;
  chairIds: readonly string[];
  patientId: string;
  durationMin: number;
  after: Date;
  /** The appointment being moved, so it does not block its own new slot. */
  excludeId?: string;
}
export interface Slot { start: Date; chairId: string }

/** The next free times for this dentist, patient and any of the chairs, soonest first. */
export function findFreeSlots(q: SlotQuery, existing: readonly Appointment[], limit = 5, days = 14): Slot[] {
  const out: Slot[] = [];
  for (let d = 0; d < days && out.length < limit; d++) {
    const day = new Date(q.after.getFullYear(), q.after.getMonth(), q.after.getDate() + d);
    if (day.getDay() === 0) continue;
    for (let m = DAY_START_MIN; m + q.durationMin <= DAY_END_MIN && out.length < limit; m += SLOT_STEP_MIN) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m);
      if (start <= q.after) continue;
      const end = new Date(start.getTime() + q.durationMin * 60_000);
      const chairId = q.chairIds.find((c) => findConflicts({ id: q.excludeId, patientId: q.patientId, dentistId: q.dentistId, chairId: c, start, end }, existing).length === 0);
      if (chairId) {
        out.push({ start, chairId });
        m += q.durationMin - SLOT_STEP_MIN; // offer back-to-back choices, not overlapping ones
      }
    }
  }
  return out;
}
