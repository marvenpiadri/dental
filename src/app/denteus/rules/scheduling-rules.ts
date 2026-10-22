import { Appointment, AppointmentStatus } from '../models/dental.models';

/**
 * Scheduling rules as pure functions.
 *
 * These mirror what the Denteus backend must enforce. The browser uses them to give instant
 * feedback, but the server stays authoritative: it must repeat every check inside the same
 * transaction that writes the appointment (see DENTEUS.md for the database constraints).
 */

/** Statuses that occupy their dentist, chair and patient for the whole duration. */
export const ACTIVE_STATUSES: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'arrived',
  'in-progress',
  'completed',
];

/** Statuses an appointment may be moved or re-assigned in. */
export const MOVABLE_STATUSES: readonly AppointmentStatus[] = ['scheduled', 'confirmed'];

/** The only allowed status changes. Anything not listed here is refused. */
export const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ['confirmed', 'arrived', 'cancelled', 'no-show'],
  confirmed: ['arrived', 'cancelled', 'no-show'],
  arrived: ['in-progress', 'cancelled'],
  'in-progress': ['completed'],
  completed: [],
  // reinstating re-checks the slot, because someone else may have booked it meanwhile
  cancelled: ['scheduled'],
  'no-show': ['scheduled'],
};

export const MIN_DURATION_MIN = 15;
export const MAX_DURATION_MIN = 480;

export const isActive = (status: AppointmentStatus): boolean => ACTIVE_STATUSES.includes(status);
export const isMovable = (status: AppointmentStatus): boolean => MOVABLE_STATUSES.includes(status);
export const canTransition = (from: AppointmentStatus, to: AppointmentStatus): boolean => TRANSITIONS[from].includes(to);

export type ResourceKind = 'dentist' | 'chair' | 'patient';

export interface Conflict {
  resource: ResourceKind;
  with: Appointment;
}

export interface Candidate {
  /** Set when an existing appointment is being changed, so it does not conflict with itself. */
  id?: string;
  patientId: string;
  dentistId: string;
  chairId: string;
  start: Date;
  end: Date;
}

/** Half-open intervals: 10:00-10:45 and 10:45-11:30 do not overlap; 10:00-10:45 and 10:30-11:00 do. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Every resource the candidate would double-book, across its FULL duration. */
export function findConflicts(candidate: Candidate, existing: readonly Appointment[]): Conflict[] {
  const found: Conflict[] = [];
  for (const other of existing) {
    if (other.id === candidate.id || !isActive(other.status)) continue;
    if (!overlaps(candidate.start, candidate.end, other.start, other.end)) continue;
    if (other.dentistId === candidate.dentistId) found.push({ resource: 'dentist', with: other });
    if (other.chairId === candidate.chairId) found.push({ resource: 'chair', with: other });
    if (other.patientId === candidate.patientId) found.push({ resource: 'patient', with: other });
  }
  return found;
}

/** Returns a message when the times themselves are unacceptable, otherwise null. */
export function validateTiming(start: Date, end: Date): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'The date or time is not valid.';
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (minutes < MIN_DURATION_MIN) return `An appointment lasts at least ${MIN_DURATION_MIN} minutes.`;
  if (minutes > MAX_DURATION_MIN) return `An appointment cannot last more than ${MAX_DURATION_MIN / 60} hours.`;
  if (start.toDateString() !== new Date(end.getTime() - 1).toDateString()) return 'An appointment must start and end on the same day.';
  return null;
}
