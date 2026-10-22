import type { IconName } from '../../calendar/components/cal-icon/cal-icon.component';
import type { EventTone } from '../../calendar/models/calendar.models';

export interface Patient {
  id: string;
  fullName: string;
  phone: string;
}

export interface Dentist {
  id: string;
  name: string;
  specialty: string;
  /** Colour of this dentist's appointments in every view. */
  color: string;
}

export interface Chair {
  id: string;
  name: string;
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'arrived'
  | 'in-progress'
  | 'completed'
  | 'cancelled'
  | 'no-show';

export type AppointmentTypeId =
  | 'consultation'
  | 'checkup'
  | 'cleaning'
  | 'filling'
  | 'root-canal'
  | 'extraction'
  | 'orthodontics'
  | 'emergency';

export interface AppointmentType {
  id: AppointmentTypeId;
  label: string;
  /** Suggested duration when the type is picked. */
  minutes: number;
}

export const APPOINTMENT_TYPES: readonly AppointmentType[] = [
  { id: 'consultation', label: 'Consultation', minutes: 30 },
  { id: 'checkup', label: 'Check-up', minutes: 30 },
  { id: 'cleaning', label: 'Cleaning', minutes: 45 },
  { id: 'filling', label: 'Filling', minutes: 60 },
  { id: 'root-canal', label: 'Root canal', minutes: 90 },
  { id: 'extraction', label: 'Extraction', minutes: 45 },
  { id: 'orthodontics', label: 'Orthodontics', minutes: 30 },
  { id: 'emergency', label: 'Emergency', minutes: 30 },
];

export const STATUS_META: Record<
  AppointmentStatus,
  { label: string; icon: IconName; tone: EventTone; description: string }
> = {
  scheduled: { label: 'Scheduled', icon: 'calendar', tone: 'normal', description: 'Booked, not yet confirmed with the patient' },
  confirmed: { label: 'Confirmed', icon: 'check', tone: 'normal', description: 'The patient confirmed' },
  arrived: { label: 'Waiting', icon: 'clock', tone: 'attention', description: 'The patient is in the waiting room' },
  'in-progress': { label: 'In treatment', icon: 'play', tone: 'active', description: 'Treatment has started' },
  completed: { label: 'Completed', icon: 'circle-check', tone: 'done', description: 'The visit is finished' },
  cancelled: { label: 'Cancelled', icon: 'ban', tone: 'muted', description: 'Cancelled; the slot is free again' },
  'no-show': { label: 'No-show', icon: 'user-x', tone: 'muted', description: 'The patient did not come' },
};

/** Who did what and when; kept for every status change. */
export interface StatusChange {
  from: AppointmentStatus | null;
  to: AppointmentStatus;
  at: Date;
  by: string;
}

/** Kept for every reschedule so the original booking is never lost. */
export interface ScheduleChange {
  at: Date;
  by: string;
  fromStart: Date;
  toStart: Date;
  fromDentistId: string;
  toDentistId: string;
  fromChairId: string;
  toChairId: string;
}

/**
 * A booking. It says when and where a visit is planned; it is NOT proof that a procedure was
 * performed. The clinical encounter (linked through `encounterId`) is what records the actual visit.
 */
export interface Appointment {
  id: string;
  patientId: string;
  dentistId: string;
  chairId: string;
  type: AppointmentTypeId;
  status: AppointmentStatus;
  start: Date;
  end: Date;
  reason?: string;
  note?: string;
  encounterId?: string;
  createdAt: Date;
  createdBy: string;
  history: StatusChange[];
  scheduleHistory: ScheduleChange[];
}

/** What the booking form edits. */
export interface AppointmentDraft {
  id?: string;
  patientId: string | null;
  dentistId: string;
  chairId: string;
  type: AppointmentTypeId;
  status: AppointmentStatus;
  start: Date;
  durationMin: number;
  reason: string;
  note: string;
}

export type ApiResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: 'conflict' | 'invalid' | 'forbidden' | 'not-found';
      message: string;
      /** One line per problem, e.g. which resource is taken and when. */
      details: string[];
    };
