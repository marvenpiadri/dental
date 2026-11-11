import type { OpeningHours } from '../rules/opening-hours';
import type { Examination } from '../odontogram/engine/exam';
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
  /** Opening hours the slot finder uses; unset means the defaults. */
  hours?: OpeningHours;
  phone?: string;
  email?: string;
  /** Printed on invoices: the registered business name, tax number (ICE in Morocco), bank details and a footer note. */
  legalName?: string;
  taxId?: string;
  bank?: string;
  invoiceNote?: string;
  /** Public page content and location, all owned by the clinic. Absent until the owner fills it in. */
  profile?: ClinicProfile;
  /** Printed at the top of prescriptions. Resized in the browser and kept as a data URL. */
  logo?: string;
}

export type PublishState = 'draft' | 'published' | 'unpublished' | 'closed';

/** What the clinic publishes about itself. `name`/`legalName` on the location stay the private business identity. */
export interface ClinicProfile {
  state: PublishState;
  displayName?: string;
  intro?: string;
  description?: string;
  /** Images are resized in the browser and kept as data URLs until the online version stores files. */
  cover?: string;
  gallery?: string[];
  whatsapp?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  /** ISO 3166-1 alpha-2, for example `MA`. */
  countryCode?: string;
  country?: string;
  region?: string;
  city?: string;
  lat?: number;
  lng?: number;
  /** Google's identifier for the place; the only Google data kept as an external reference. */
  placeId?: string;
  /** Last URL segment. The full path is `/clinics/{country}/{city}/{slug}` built by `clinicPath`. */
  slug?: string;
  /** Slugs this clinic used to publish under; they redirect to the current one. */
  previousSlugs?: string[];
  languages?: string[];
  services?: string[];
  specialties?: string[];
  /** Holidays and temporary closures, ISO dates. */
  closures?: { from: string; to: string; reason?: string }[];
  publishedAt?: string;
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
  /** Structured medical history; `alert` stays the free-text note beside it. */
  medical?: MedicalHistory;
  notes?: string;
  /** ISO timestamp. Absent on records created before this field existed. */
  createdAt?: string;
  /** The working dental chart (CRM engine payload: findings, plan, case data). Validated on read, never trusted. */
  odontogram?: unknown;
  /** Dated, frozen snapshots of the chart, one per examination. */
  examinations?: Examination[];
  /** Treatment plan: what was proposed and what has been done, with prices. */
  plan?: TreatmentItem[];
  /** Money received from the patient. What they owe is the done work in `plan` minus these. */
  payments?: Payment[];
  /** Invoices and credit notes issued to this patient, oldest first. */
  invoices?: Invoice[];
  /** ISO timestamp when the patient was archived. Archived patients leave the list and the pickers but keep every record. */
  archivedAt?: string;
  /** Certificates and referral letters, oldest first. */
  letters?: Letter[];
  /** Prescriptions (drafts, issued, voided, superseded), oldest first. Issued ones are never edited. */
  prescriptions?: Prescription[];
  /** Structured medical records that point into the clinic's libraries. The free-text `medical.allergies` / `medical.medications` are kept untouched beside them. */
  patientAllergies?: PatientAllergy[];
  patientMedications?: PatientMedication[];
  /** Whether the patient agreed to WhatsApp messages from the clinic. Unset means not asked yet; `declined` blocks every message. */
  whatsappConsent?: 'granted' | 'declined';
  /** ISO timestamp the consent answer was recorded. */
  whatsappConsentAt?: string;
  /** WhatsApp messages prepared for this patient, oldest first. */
  messages?: Message[];
  /** What was found and done at each visit, newest last. */
  visits?: VisitNote[];
  /** Dated versions of the quote given to the patient, oldest first, with the patient's answer. */
  proposals?: PlanProposal[];
  /** Small JPEG data URL (see the profile's photo picker). Optional, added whenever the clinic likes. */
  photo?: string;
}

/** Ticked conditions are ids from `CONDITIONS` (patient-rules.ts); allergies and medications are free text the dentist reads, never interpreted. */
export interface MedicalHistory {
  conditions?: string[];
  allergies?: string;
  medications?: string;
  /** Pieces of the free text a dentist has already turned into a structured record (lower-cased, trimmed). The original text is never edited. */
  legacyMatched?: string[];
}

/** One quote given to the patient. A newer quote supersedes an unanswered older one; nothing is deleted. */
export interface PlanProposal {
  id: string;
  version: number;
  /** ISO timestamp the quote was recorded. */
  at: string;
  lines: { tooth?: string; name: string; price: number }[];
  total: number;
  status: 'proposed' | 'accepted' | 'declined' | 'superseded';
  /** ISO timestamp of the patient's answer. */
  decidedAt?: string;
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
  /** Earlier versions, oldest first. A correction keeps what was there before instead of overwriting it. */
  revisions?: NoteRevision[];
  /** A voided note stays in the record, shown struck through with its reason; clinical history is never deleted. */
  voidedAt?: string;
  voidReason?: string;
}

export interface NoteRevision {
  /** ISO timestamp the version was replaced. */
  at: string;
  complaint?: string;
  findings?: string;
  care?: string;
  prescription?: PrescriptionLine[];
}

/**
 * One WhatsApp message. In Phase 2 the receptionist presses send in WhatsApp, so the best the app knows is `prepared`.
 * Phase 3 (the clinic's own WhatsApp Business Cloud API number) moves it through sent, delivered, read or failed and stores `externalId`.
 */
export interface Message {
  id: string;
  /** ISO timestamp. */
  at: string;
  kind: 'appointment' | 'balance' | 'recall';
  text: string;
  status: 'prepared' | 'sent' | 'delivered' | 'read' | 'failed';
  appointmentId?: string;
  externalId?: string;
}

/** A medical certificate or referral letter. Never edited after it is written: a mistake is corrected by writing a new one. */
export interface Letter {
  id: string;
  /** ISO timestamp. */
  at: string;
  kind: 'certificate' | 'referral';
  dentistId?: string;
  /** Referral only: who the patient is sent to (a specialist or clinic). */
  to?: string;
  /** Certificate only: days of rest, when the certificate grants any. */
  restDays?: number;
  text: string;
}

export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'cheque', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Payment {
  id: string;
  /** Whole units of the clinic's currency, more than zero. */
  amount: number;
  method: PaymentMethod;
  /** ISO timestamp. */
  at: string;
  /** Card slip, transfer or cheque number: whatever lets the clinic find the money in its bank statement. */
  reference?: string;
  note?: string;
  /** The invoice this money settles; absent means an advance or a payment on account. */
  invoiceId?: string;
  /** A voided payment is never deleted: it stays in the history, out of every total. */
  voidedAt?: string;
  voidReason?: string;
}

/** One line of an invoice, frozen when the invoice is issued so later plan edits never rewrite it. */
export interface InvoiceLine {
  itemId: string;
  label: string;
  /** Tooth or area the act covered, as text. */
  where?: string;
  /** Whole units; negative on a credit note. */
  price: number;
}

/**
 * An invoice, or the credit note that cancels one. Never edited and never deleted after issue:
 * a mistake is cancelled (which issues a credit note) and the work is invoiced again under a new number.
 */
export interface Invoice {
  id: string;
  /** `FA-2026-0001` for invoices, `AV-2026-0001` for credit notes: gap-free per kind and year. */
  number: string;
  kind: 'invoice' | 'credit-note';
  /** ISO timestamp. */
  issuedAt: string;
  lines: InvoiceLine[];
  total: number;
  /** A credit note points at the invoice it cancels. */
  cancelsId?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export const PROCEDURES = ['filling', 'cleaning', 'extraction', 'root-canal', 'crown', 'implant', 'xray', 'other'] as const;
export type ProcedureId = (typeof PROCEDURES)[number];

/** One procedure the clinic offers, with its usual price. Built-in procedures have no `name`: they are translated. */
export interface CatalogEntry {
  id: string;
  name?: string;
  price: number;
}

export interface TreatmentItem {
  id: string;
  /** FDI tooth number, absent for work that isn't about one tooth (a cleaning). */
  tooth?: string;
  /** What a tooth-less procedure covers; absent means one tooth (`tooth`) or no tooth at all. */
  scope?: 'quadrant' | 'upper' | 'lower' | 'mouth';
  /** 1–4, only with `scope: 'quadrant'`. */
  quadrant?: 1 | 2 | 3 | 4;
  /** A catalog entry's id: one of `PROCEDURES` for the built-ins, otherwise generated. */
  procedure: string;
  /** The procedure's name when the item was added, so renaming or removing a catalog entry never rewrites old plans. */
  name?: string;
  /** In the clinic's currency, whole units. */
  price: number;
  status: 'planned' | 'done';
  /** Day (`YYYY-MM-DD`) the procedure was recorded, set by the procedure panel. */
  date?: string;
  /** ISO timestamp the item was marked done. */
  doneAt?: string;
  /** The appointment this act was recorded from, when it was recorded at the visit. Display and de-duplication only: it never bills or completes anything. */
  appointmentId?: string;
}


/** What the patient form edits. Everything but the name is optional. */
export type PatientInput = Omit<Patient, 'id' | 'createdAt' | 'odontogram' | 'examinations' | 'plan' | 'payments' | 'invoices' | 'letters' | 'archivedAt' | 'messages' | 'whatsappConsent' | 'whatsappConsentAt' | 'visits' | 'proposals'>;

export interface Dentist {
  id: string;
  locationId?: string;
  name: string;
  specialty: string;
  /** Colour of this dentist's appointments in every view. */
  color: string;
  /** Own working times (the clinic's open days still apply). Unset means the clinic's hours. */
  hours?: { open?: string; close?: string };
  /** Contact and professional details shown on the doctor's profile and printed on documents they sign. */
  phone?: string;
  email?: string;
  /** Professional registration number, exactly as the dentist writes it. */
  registration?: string;
  /** Small square JPEG data URL. */
  photo?: string;
}

export interface Chair {
  id: string;
  locationId?: string;
  name: string;
  /** Optional: overrides the default tint this chair gets in the calendar. */
  color?: string;
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
  /** FDI number of the tooth this image is about, when it is about one. */
  tooth?: string;
  blob: Blob;
}

/* ------------------------------ prescriptions ------------------------------ */

/**
 * One entry of the clinic's medication master list (Open Dental style). A generic stands alone and carries the notes; a brand always
 * points at a generic and shows its name through that link. Nothing is built in: the dentist adds what the practice uses.
 */
export interface LibMedication {
  id: string;
  kind: 'generic' | 'brand';
  name: string;
  /** Brands only: the generic this brand belongs to. */
  genericId?: string;
  /** Generics only: practice-written notes (therapeutic category, precautions), shared by every brand. */
  notes?: string;
  /** Medical-condition codes to flag when this drug is added to a prescription (kept from the earlier medication list). */
  reviewConditions?: string[];
  /** Hidden from pickers but kept, for records that still point at it. */
  hidden?: boolean;
  /** Free field for a future interoperability code. Never required, never interpreted. */
  externalId?: string;
}

/** The clinic's allergy master list. An allergy may point at a medication; it never needs a code. */
export interface AllergyDef {
  id: string;
  name: string;
  medicationId?: string;
  externalId?: string;
  hidden?: boolean;
}

export interface AuditEntry { at: string; what: string; note?: string }

/** A patient's allergy: a reference to the allergy list plus what happened to this patient. `label` keeps the name as it was recorded. */
export interface PatientAllergy {
  id: string;
  allergyId: string;
  label: string;
  reaction?: string;
  reactionDate?: string;
  active: boolean;
  createdAt: string;
  removedAt?: string;
  /** The piece of free text this record was confirmed from, when it came from the old notes. */
  legacyText?: string;
  history: AuditEntry[];
}

export interface PatientMedication {
  id: string;
  medicationId: string;
  label: string;
  /** Patient-specific notes. The generic's own notes stay on the library entry. */
  notes?: string;
  start?: string;
  stop?: string;
  active: boolean;
  source?: 'manual' | 'prescribed' | 'reported';
  prescriptionId?: string;
  createdAt: string;
  removedAt?: string;
  legacyText?: string;
  history: AuditEntry[];
}

/** An alert a prescription line raises when the patient has the allergy, medication or condition it names. Set by the dentist, never inferred. */
export interface RxAlert {
  id: string;
  type: 'allergy' | 'medication' | 'problem';
  /** Allergy id, medication id, or a condition code. */
  refId: string;
  label: string;
  message?: string;
  severity: 'critical' | 'warning';
}

/** A medication line on a prescription. Copies the medication's text so later edits to the list never change it. */
export interface RxItem {
  id: string;
  medicationId?: string;
  name: string;
  brand?: string;
  generic?: string;
  strength?: string;
  form?: string;
  route?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  refills?: string;
  instructions?: string;
  /** Copied from the medication record when the line was added; used only for the safety notes. */
  /** Old free-text family names from before the structured libraries. Kept on old records, no longer used to match anything. */
  aliases?: string;
  reviewConditions?: string[];
  /** Raised when the patient has the allergy, medication or condition named; see `RxAlert`. */
  alerts?: RxAlert[];
  /** For the practice only: never printed. */
  internalNotes?: string;
}

export interface RxTemplate {
  id: string;
  name: string;
  description?: string;
  items: RxItem[];
  updatedAt: string;
}

export type PrescriptionStatus = 'draft' | 'issued' | 'voided' | 'superseded';

/** Who wrote and for whom, frozen when the prescription is issued so later profile edits never change it. */
export interface RxSnapshot {
  clinic: { name: string; address?: string; phone?: string; email?: string; logo?: string };
  dentist: { name: string; specialty?: string; registration?: string; phone?: string; email?: string };
  patient: { name: string; birthDate?: string; sex?: 'female' | 'male'; phone?: string };
}

export interface Prescription {
  id: string;
  /** Set when issued, `RX-2026-0001`. Drafts have none. */
  number?: string;
  status: PrescriptionStatus;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string;
  dentistId?: string;
  appointmentId?: string;
  templateId?: string;
  items: RxItem[];
  /** Free text for the patient, printed under the medications. */
  notes?: string;
  snapshot?: RxSnapshot;
  /** The safety notes the dentist confirmed they had reviewed before issuing. */
  acknowledged?: string[];
  /** A correction is a new prescription pointing at the one it replaces; the original stays, marked superseded once the correction is issued. */
  correctsId?: string;
  correctionReason?: string;
  supersededById?: string;
  voidedAt?: string;
  voidReason?: string;
}
