import type { IconName } from '../../calendar/components/cal-icon/cal-icon.component';
import type { EventTone } from '../../calendar/models/calendar.models';

/** A physical clinic site. Operational records reference this ID instead of assuming one global practice. */
export interface ClinicLocation {
  id: string;
  name: string;
  code: string;
  address?: string;
  timezone: string;
  active: boolean;
}

export interface Patient {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  /** ISO date, `YYYY-MM-DD`. Stored as a string so there is no time zone to get wrong. */
  birthDate?: string;
  sex?: 'female' | 'male';
  city?: string;
  /** Medical alert shown prominently on the profile and the booking form (allergies, conditions, anticoagulants...). */
  alert?: string;
  notes?: string;
  /** ISO timestamp. Absent on records created before this field existed. */
  createdAt?: string;
  /** Tooth chart: FDI tooth number (11-48) to its recorded condition. Teeth not listed are healthy. */
  /** The odontogram library's chart payload for this patient (status chart, plan chart and case data). */
  odontogram?: unknown;
  /** Treatment plan: what was proposed and what has been done, with prices. */
  plan?: TreatmentItem[];
  /** Money received from the patient. What they owe is the done work in `plan` minus these. */
  payments?: Payment[];
  /** What was found and done at each visit, newest last. */
  visits?: VisitNote[];
}

export interface PrescriptionLine {
  drug: string;
  /** Free text ("1 g, 3 times a day"): the dentist decides, the app never suggests doses. */
  dosage: string;
  duration: string;
}

export interface VisitNote {
  id: string;
  /** ISO timestamp the note was written. */
  at: string;
  appointmentId?: string;
  dentistId?: string;
  complaint?: string;
  findings?: string;
  care?: string;
  prescription?: PrescriptionLine[];
}

export const PAYMENT_METHODS = ['cash', 'card', 'transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Payment {
  id: string;
  /** Whole units of the clinic's currency, more than zero. */
  amount: number;
  method: PaymentMethod;
  /** ISO timestamp. */
  at: string;
}

export const PROCEDURES = ['filling', 'cleaning', 'extraction', 'root-canal', 'crown', 'implant', 'xray', 'other'] as const;
export type ProcedureId = (typeof PROCEDURES)[number];

/** One act the clinic offers, with its usual price. Built-in acts have no `name`: they are translated. */
export interface CatalogEntry {
  id: string;
  name?: string;
  price: number;
}

export interface TreatmentItem {
  id: string;
  /** FDI tooth number, absent for work that isn't about one tooth (a cleaning). */
  tooth?: string;
  /** A catalog entry's id: one of `PROCEDURES` for the built-ins, otherwise generated. */
  procedure: string;
  /** The act's name when the item was added, so renaming or removing a catalog entry never rewrites old plans. */
  name?: string;
  /** In the clinic's currency, whole units. */
  price: number;
  status: 'planned' | 'done';
  /** ISO timestamp the item was marked done. */
  doneAt?: string;
}


/** What the patient form edits. Everything but the name is optional. */
export type PatientInput = Omit<Patient, 'id' | 'createdAt' | 'odontogram' | 'plan' | 'payments' | 'visits'>;

export interface Dentist {
  id: string;
  locationId?: string;
  name: string;
  specialty: string;
  /** Colour of this dentist's appointments in every view. */
  color: string;
}

export interface Chair {
  id: string;
  locationId?: string;
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
  locationId?: string;
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
  /** ISO time the WhatsApp reminder was opened for this visit. */
  remindedAt?: string;
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

/** A file attached to a patient (X-ray, photo, report). Kept in IndexedDB only, outside the backup file. */
export interface PatientDocument {
  id: string;
  patientId: string;
  name: string;
  /** MIME type. */
  type: string;
  size: number;
  /** ISO timestamp. */
  addedAt: string;
  blob: Blob;
}
