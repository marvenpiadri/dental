import type { Appointment } from '../models/dental.models';
import { DEFAULT_HOURS, type Hours } from './opening-hours';
import { findConflicts } from './scheduling-rules';

/** shortcut: one set of hours for the whole clinic and every dentist; per-dentist hours later. */
export const SLOT_STEP_MIN = 15;

export interface SlotQuery {
  dentistId: string;
  chairIds: readonly string[];
  patientId: string;
  durationMin: number;
  after: Date;
  /** The appointment being moved, so it does not block its own new slot. */
  excludeId?: string;
  hours?: Hours;
}
export interface Slot { start: Date; chairId: string }

/** The next free times for this dentist, patient and any of the chairs, soonest first. */
export function findFreeSlots(q: SlotQuery, existing: readonly Appointment[], limit = 5, days = 14): Slot[] {
  const out: Slot[] = [];
  const { startMin, endMin, days: open } = q.hours ?? DEFAULT_HOURS;
  for (let d = 0; d < days && out.length < limit; d++) {
    const day = new Date(q.after.getFullYear(), q.after.getMonth(), q.after.getDate() + d);
    if (!open.includes(day.getDay())) continue;
    for (let m = startMin; m + q.durationMin <= endMin && out.length < limit; m += SLOT_STEP_MIN) {
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
