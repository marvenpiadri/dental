import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { addMinutes, formatTime, newId } from '../../calendar/utils/date.utils';
import { ClinicData } from './backup';
import { parseHours } from '../rules/opening-hours';
import { I18n } from '../../core/i18n/i18n.service';
import { STATUS_LABEL } from '../utils/domain-keys';
import { ClinicDatabase } from './clinic-database.service';
import { defaultCatalog } from '../patients/treatment-rules';
import type { Examination } from '../odontogram/engine/exam';
import {
  ApiResult,
  Appointment,
  AppointmentDraft,
  AppointmentStatus,
  Chair,
  ClinicLocation,
  Dentist,
  Patient,
  PatientInput,
  CatalogEntry,
  Payment,
  VisitNote,
  TreatmentItem,
} from '../models/dental.models';
import {
  Candidate,
  canTransition,
  findConflicts,
  isMovable,
  validateTiming,
} from '../rules/scheduling-rules';


/** The fields a drag or an "edit time" action may change. */
export interface RescheduleChange {
  start: Date;
  end: Date;
  dentistId?: string;
  chairId?: string;
}

/** Trims every text field and drops the empty optional ones, so "" never gets stored as a value. */
function tidy(input: PatientInput): PatientInput {
  const out: PatientInput = { fullName: input.fullName.trim(), phone: input.phone.trim() };
  for (const key of ['email', 'birthDate', 'sex', 'city', 'insurer', 'insuranceNumber', 'alert', 'notes'] as const) {
    const value = input[key]?.trim();
    if (value) (out as Record<string, string>)[key] = value;
  }
  return out;
}

const fail = (code: 'conflict' | 'invalid' | 'forbidden' | 'not-found', message: string, details: string[] = [message]): ApiResult<never> => ({
  ok: false,
  code,
  message,
  details,
});

/**
 * Holds the clinic's data and applies every change to it.
 *
 * IMPORTANT: this is the browser-side stand-in for the Denteus API. Every method that changes data
 * is async and returns an ApiResult so it can be replaced one-to-one by an HTTP call; the rules it
 * applies (conflicts, status transitions, history) must live on the server, which also has to
 * protect against two people booking the same slot at once. The current local-first adapter persists in IndexedDB.
 */
@Injectable()
export class DentalStore {
  readonly locations = signal<ClinicLocation[]>([]);
  readonly hours = computed(() => parseHours(this.locations()[0]?.hours));
  readonly patients = signal<Patient[]>([]);
  readonly dentists = signal<Dentist[]>([]);
  readonly chairs = signal<Chair[]>([]);
  /** The acts the clinic offers and their usual prices. */
  readonly catalog = signal<CatalogEntry[]>(defaultCatalog());
  readonly appointments = signal<Appointment[]>([]);

  /** Recorded on every change. In the real app this is the signed-in user. */
  readonly actor = signal('Front desk');

  readonly patientMap = computed(() => new Map(this.patients().map((p) => [p.id, p])));
  readonly dentistMap = computed(() => new Map(this.dentists().map((d) => [d.id, d])));
  readonly chairMap = computed(() => new Map(this.chairs().map((c) => [c.id, c])));

  /** True once the clinic records have been read from the browser database. Pages show a skeleton until then. */
  readonly loaded = signal(false);
  /** True when the browser database could not be opened (private mode, blocked storage). Pages explain it instead of staying empty. */
  readonly loadFailed = signal(false);

  private ready = false;
  private initialization: Promise<void> | null = null;
  private persistQueue: Promise<void> = Promise.resolve();
  private readonly database = inject(ClinicDatabase);
  private readonly t = inject(I18n).t;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly persistenceError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const patients = this.patients();
      const appointments = this.appointments();
      if (!this.ready) return;
      this.persistQueue = this.persistQueue
        .then(() => this.database.saveSchedulingSnapshot(patients, appointments))
        .then(() => this.persistenceError.set(null))
        .catch(() => this.persistenceError.set('Changes could not be saved to this browser. Check available storage and try again.'));
    });
  }

  /**
   * Loads clinic records from IndexedDB. A new installation starts empty rather than inventing patients or appointments.
   * Runs once however many pages ask (a second load would overwrite unsaved state), and never on the server,
   * which has no IndexedDB: the server renders the empty frame and the browser fills it.
   */
  init(): Promise<void> {
    if (!this.isBrowser) return Promise.resolve();
    return (this.initialization ??= this.load().catch((error) => {
      this.initialization = null; // let the next page retry
      this.loadFailed.set(true);
      throw error;
    }));
  }

  private async load(): Promise<void> {
    const [locations, resources] = await Promise.all([
      this.database.loadLocations(),
      this.database.loadResources(),
    ]);
    this.locations.set(locations);
    this.dentists.set(resources.dentists);
    this.chairs.set(resources.chairs);
    this.catalog.set((await this.database.loadSetting<CatalogEntry[]>('catalog')) ?? defaultCatalog());

    const saved = await this.database.loadSchedulingSnapshot();
    this.patients.set(saved.patients);
    this.appointments.set(saved.appointments);
    this.ready = true;
    this.loaded.set(true);
  }

  async saveCatalog(entries: CatalogEntry[]): Promise<void> {
    await this.database.saveSetting('catalog', entries);
    this.catalog.set(entries);
  }

  /** The clinic setup flow calls this when a site is created or changed. */
  async saveLocations(locations: ClinicLocation[]): Promise<void> {
    await this.database.saveLocations(locations);
    this.locations.set(locations);
  }

  /** The clinic setup flow calls this when dentists or chairs are created or changed. */
  async saveResources(dentists: Dentist[], chairs: Chair[]): Promise<void> {
    await this.database.saveResources(dentists, chairs);
    this.dentists.set(dentists);
    this.chairs.set(chairs);
  }

  /** Everything the clinic has, as the data a backup file holds. */
  snapshot(): ClinicData {
    return { locations: this.locations(), dentists: this.dentists(), chairs: this.chairs(), patients: this.patients(), appointments: this.appointments(), catalog: this.catalog() };
  }

  /** Replaces everything in this browser with a restored backup. Written to IndexedDB first, so a failure leaves the screen as it was. */
  async restore(data: ClinicData): Promise<void> {
    await this.saveLocations(data.locations);
    await this.saveResources(data.dentists, data.chairs);
    await this.saveCatalog(data.catalog);
    await this.database.saveSchedulingSnapshot(data.patients, data.appointments);
    this.patients.set(data.patients);
    this.appointments.set(data.appointments);
  }

  /** Wait for queued IndexedDB writes to finish. */
  async flushPersistence(): Promise<void> {
    await this.persistQueue;
    const error = this.persistenceError();
    if (error) throw new Error(error);
  }

  /* ------------------------------- patients ------------------------------- */

  /** Callers validate first (patient-rules.ts); this only tidies the text and stamps the record. */
  addPatient(input: PatientInput): Patient {
    const patient: Patient = { ...tidy(input), id: newId(), createdAt: new Date().toISOString() };
    this.patients.update((list) => [...list, patient]);
    return patient;
  }

  updatePatient(id: string, input: PatientInput): Patient | null {
    const current = this.patientMap().get(id);
    if (!current) return null;
    const patient: Patient = { ...tidy(input), id, createdAt: current.createdAt, odontogram: current.odontogram, examinations: current.examinations, plan: current.plan, payments: current.payments, visits: current.visits, photo: current.photo }; // the form doesn't edit these, so keep them
    this.patients.update((list) => list.map((p) => (p.id === id ? patient : p)));
    return patient;
  }

  /** Records (or clears, with `null`) one tooth's condition on the patient's chart. */
  /** Saves the working chart's payload on the patient. */
  setOdontogram(patientId: string, odontogram: unknown): void {
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, odontogram } : p)));
  }

  /** Sets (or clears, with `undefined`) the patient's photo, a small JPEG data URL kept locally with the record. */
  setPhoto(patientId: string, photo: string | undefined): void {
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, photo } : p)));
  }

  /** Edits a patient's treatment plan: `change` receives the current list and returns the new one. */
  changePlan(patientId: string, change: (plan: TreatmentItem[]) => TreatmentItem[]): void {
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, plan: change(p.plan ?? []) } : p)));
  }

  /** Remembers that a reminder was sent, so the front desk doesn't message the same patient twice. */
  markReminded(appointmentId: string): void {
    const at = new Date().toISOString();
    this.appointments.update((list) => list.map((a) => (a.id === appointmentId ? { ...a, remindedAt: at } : a)));
  }

  /** Appends an examination snapshot to this patient only (the record carries its own patientId; a mismatch is dropped). */
  addExamination(patientId: string, exam: Examination): void {
    if (exam.patientId !== patientId) return;
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, examinations: [...(p.examinations ?? []), exam] } : p)));
  }

  /** Same shape as `changePlan`, for the patient's visit notes. */
  changeVisits(patientId: string, change: (visits: VisitNote[]) => VisitNote[]): void {
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, visits: change(p.visits ?? []) } : p)));
  }

  /** Same shape as `changePlan`, for the patient's payments. */
  changePayments(patientId: string, change: (payments: Payment[]) => Payment[]): void {
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, payments: change(p.payments ?? []) } : p)));
  }

  /* ----------------------------- appointments ----------------------------- */

  async createAppointment(draft: AppointmentDraft): Promise<ApiResult<Appointment>> {
    if (!draft.patientId) return fail('invalid', this.t('er.select'));
    const candidate = this.candidateOf(draft);
    const problem = this.check(candidate);
    if (problem) return problem;

    const now = new Date();
    const status: AppointmentStatus = draft.status === 'confirmed' ? 'confirmed' : 'scheduled';
    const appointment: Appointment = {
      id: newId(),
      patientId: draft.patientId,
      dentistId: draft.dentistId,
      chairId: draft.chairId,
      type: draft.type,
      status,
      start: candidate.start,
      end: candidate.end,
      reason: draft.reason.trim() || undefined,
      note: draft.note.trim() || undefined,
      createdAt: now,
      createdBy: this.actor(),
      history: [{ from: null, to: status, at: now, by: this.actor() }],
      scheduleHistory: [],
    };
    this.appointments.update((list) => [...list, appointment]);
    return { ok: true, value: appointment };
  }

  /** Full edit from the booking form. Keeps the same appointment (identity and history). */
  async updateAppointment(id: string, draft: AppointmentDraft): Promise<ApiResult<Appointment>> {
    const current = this.find(id);
    if (!current) return fail('not-found', this.t('er.gone'));

    // once the visit is under way or over, only the free-text fields may change
    if (!isMovable(current.status)) {
      const next: Appointment = { ...current, reason: draft.reason.trim() || undefined, note: draft.note.trim() || undefined };
      this.replace(next);
      return { ok: true, value: next };
    }
    if (!draft.patientId) return fail('invalid', this.t('er.select'));

    const candidate = { ...this.candidateOf(draft), id };
    const problem = this.check(candidate);
    if (problem) return problem;

    let next: Appointment = {
      ...current,
      patientId: draft.patientId,
      type: draft.type,
      reason: draft.reason.trim() || undefined,
      note: draft.note.trim() || undefined,
    };
    next = this.withSchedule(next, candidate.start, candidate.end, draft.dentistId, draft.chairId);
    this.replace(next);
    return { ok: true, value: next };
  }

  /** Drag and drop / resize. Only the schedule changes. */
  async reschedule(id: string, change: RescheduleChange): Promise<ApiResult<Appointment>> {
    const current = this.find(id);
    if (!current) return fail('not-found', this.t('er.gone'));
    if (!isMovable(current.status)) {
      return fail('forbidden', this.t('er.nomove', { s: this.t(STATUS_LABEL[current.status]) }));
    }
    const dentistId = change.dentistId ?? current.dentistId;
    const chairId = change.chairId ?? current.chairId;
    const candidate: Candidate = {
      id,
      patientId: current.patientId,
      dentistId,
      chairId,
      start: change.start,
      end: change.end,
    };
    const problem = this.check(candidate);
    if (problem) return problem;

    const next = this.withSchedule(current, change.start, change.end, dentistId, chairId);
    this.replace(next);
    return { ok: true, value: next };
  }

  async transition(id: string, to: AppointmentStatus): Promise<ApiResult<Appointment>> {
    const current = this.find(id);
    if (!current) return fail('not-found', this.t('er.gone'));
    if (!canTransition(current.status, to)) {
      return fail('forbidden', this.t('er.notrans', { a: this.t(STATUS_LABEL[current.status]).toLowerCase(), b: this.t(STATUS_LABEL[to]).toLowerCase() }));
    }
    if (to === 'arrived' && current.start.toDateString() !== new Date().toDateString()) {
      return fail('forbidden', this.t('er.arrivedToday'));
    }
    if (to === 'scheduled') {
      // reinstating: the slot may have been taken in the meantime
      const problem = this.check({ id, patientId: current.patientId, dentistId: current.dentistId, chairId: current.chairId, start: current.start, end: current.end });
      if (problem) return problem;
    }
    const now = new Date();
    const next: Appointment = {
      ...current,
      status: to,
      history: [...current.history, { from: current.status, to, at: now, by: this.actor() }],
    };
    this.replace(next);
    return { ok: true, value: next };
  }

  /** Called by the clinical module once an encounter exists for this visit. */
  linkEncounter(id: string, encounterId: string): void {
    const current = this.find(id);
    if (current) this.replace({ ...current, encounterId });
  }

  /** Human-readable problems the candidate would cause; empty when the slot is free. Instant UI feedback only. */
  previewConflicts(candidate: Candidate): string[] {
    const timing = validateTiming(candidate.start, candidate.end);
    if (timing) return [this.t(timing.key, { n: timing.n ?? 0 })];
    return this.describeConflicts(candidate);
  }

  /* ------------------------------- internals ------------------------------- */

  private find(id: string): Appointment | undefined {
    return this.appointments().find((a) => a.id === id);
  }

  private replace(next: Appointment): void {
    this.appointments.update((list) => list.map((a) => (a.id === next.id ? next : a)));
  }

  private candidateOf(draft: AppointmentDraft): Candidate {
    return {
      id: draft.id,
      patientId: draft.patientId ?? '',
      dentistId: draft.dentistId,
      chairId: draft.chairId,
      start: draft.start,
      end: addMinutes(draft.start, draft.durationMin),
    };
  }

  /** Validation plus conflicts; returns a failure result or null when everything is fine. */
  private check(candidate: Candidate): ApiResult<never> | null {
    const timing = validateTiming(candidate.start, candidate.end);
    if (timing) return fail('invalid', this.t(timing.key, { n: timing.n ?? 0 }));
    if (!this.dentistMap().has(candidate.dentistId)) return fail('invalid', this.t('er.dentist'));
    if (!this.chairMap().has(candidate.chairId)) return fail('invalid', this.t('er.chair'));
    if (!this.patientMap().has(candidate.patientId)) return fail('invalid', this.t('er.select'));

    const details = this.describeConflicts(candidate);
    if (details.length) return fail('conflict', details.join(' '), details);
    return null;
  }

  private describeConflicts(candidate: Candidate): string[] {
    return findConflicts(candidate, this.appointments()).map((c) => {
      const when = `${formatTime(c.with.start)}–${formatTime(c.with.end)}`;
      const who = this.patientMap().get(c.with.patientId)?.fullName ?? this.t('er.other');
      switch (c.resource) {
        case 'dentist':
          return this.t('er.dentistBusy', { n: this.dentistMap().get(c.with.dentistId)?.name ?? this.t('er.theDentist'), w: when, p: who });
        case 'chair':
          return this.t('er.chairBusy', { n: this.chairMap().get(c.with.chairId)?.name ?? this.t('er.theChair'), w: when, p: who });
        case 'patient':
          return this.t('er.patientBusy', { n: this.patientMap().get(c.with.patientId)?.fullName ?? this.t('er.thePatient'), w: when, d: this.dentistMap().get(c.with.dentistId)?.name ?? this.t('er.anotherDentist') });
      }
    });
  }

  /** Applies a new schedule and records the original one, only when something actually changed. */
  private withSchedule(a: Appointment, start: Date, end: Date, dentistId: string, chairId: string): Appointment {
    const changed =
      a.start.getTime() !== start.getTime() || a.end.getTime() !== end.getTime() || a.dentistId !== dentistId || a.chairId !== chairId;
    if (!changed) return a;
    return {
      ...a,
      start,
      end,
      dentistId,
      chairId,
      scheduleHistory: [
        ...a.scheduleHistory,
        {
          at: new Date(),
          by: this.actor(),
          fromStart: a.start,
          toStart: start,
          fromDentistId: a.dentistId,
          toDentistId: dentistId,
          fromChairId: a.chairId,
          toChairId: chairId,
        },
      ],
    };
  }

}
