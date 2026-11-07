import { ClinicPrefs, DEFAULT_PREFS, normalizePrefs } from '../setup/prefs-rules';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { addMinutes, formatTime, newId } from '../../calendar/utils/date.utils';
import { ClinicData } from './backup';
import { parseHours } from '../rules/opening-hours';
import { I18n } from '../../core/i18n/i18n.service';
import { STATUS_LABEL } from '../utils/domain-keys';
import { AuthService } from '../../core/auth/auth.service';
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
  Invoice,
  Letter,
  Message,
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
  /** Patient-file pages this clinic switched off (Setup). */
  readonly hiddenPages = signal<string[]>([]);
  /** The 3D tooth overlay; turning it off leaves the flat chart exactly as before. */
  readonly view3d = signal(true);
  /** Clinic wording for WhatsApp messages; a kind left out uses the built-in text. */
  readonly prefs = signal<ClinicPrefs>(DEFAULT_PREFS);
  readonly waTemplates = signal<Partial<Record<Message['kind'], string>>>({});
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
  private readonly auth = inject(AuthService);
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
    this.locations.set(locations.map((l) => (l.name === 'Dentaleus' ? { ...l, name: 'Dontalist' } : l))); // the old default name, from before the product was named
    this.dentists.set(resources.dentists);
    this.chairs.set(resources.chairs);
    this.catalog.set((await this.database.loadSetting<CatalogEntry[]>('catalog')) ?? defaultCatalog());

    this.hiddenPages.set((await this.database.loadSetting<string[]>('hiddenPages')) ?? []);
    this.view3d.set((await this.database.loadSetting<boolean>('view3d')) ?? true);
    this.prefs.set(normalizePrefs(await this.database.loadSetting<unknown>('prefs')));
    this.waTemplates.set((await this.database.loadSetting<Partial<Record<Message['kind'], string>>>('waTemplates')) ?? {});

    const saved = await this.database.loadSchedulingSnapshot();
    this.patients.set(saved.patients);
    this.appointments.set(saved.appointments);
    this.ready = true;
    this.loaded.set(true);
  }

  async saveView3d(on: boolean): Promise<void> {
    await this.database.saveSetting('view3d', on);
    this.view3d.set(on);
  }

  async saveHiddenPages(ids: string[]): Promise<void> {
    await this.database.saveSetting('hiddenPages', ids);
    this.hiddenPages.set(ids);
  }

  async savePrefs(patch: Partial<ClinicPrefs>): Promise<void> {
    const next = normalizePrefs({ ...this.prefs(), ...patch });
    await this.database.saveSetting('prefs', next);
    this.prefs.set(next);
  }

  async saveWaTemplates(templates: Partial<Record<Message['kind'], string>>): Promise<void> {
    await this.database.saveSetting('waTemplates', templates);
    this.waTemplates.set(templates);
  }

  /** The text of one WhatsApp message: the clinic's own wording when it set one, else the built-in text (`fallback`). */
  message(kind: Message['kind'], fallback: string, vars: Record<string, string>): string {
    const custom = this.waTemplates()[kind]?.trim();
    return custom ? custom.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all) : fallback;
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
    const patient: Patient = { ...tidy(input), id, createdAt: current.createdAt, odontogram: current.odontogram, examinations: current.examinations, plan: current.plan, payments: current.payments, invoices: current.invoices, letters: current.letters, archivedAt: current.archivedAt, messages: current.messages, whatsappConsent: current.whatsappConsent, whatsappConsentAt: current.whatsappConsentAt, visits: current.visits, photo: current.photo }; // the form doesn't edit these, so keep them
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
    if (!this.auth.can('clinical.edit')) return; // the buttons are hidden too; this keeps every caller honest
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, plan: change(p.plan ?? []) } : p)));
  }

  /** Remembers that a reminder was sent, so the front desk doesn't message the same patient twice. */
  markReminded(appointmentId: string): void {
    const at = new Date().toISOString();
    this.appointments.update((list) => list.map((a) => (a.id === appointmentId ? { ...a, remindedAt: at } : a)));
  }

  /** Same shape as `changePlan`, for the patient's letters. Callers only append. */
  changeLetters(patientId: string, change: (letters: Letter[]) => Letter[]): void {
    if (!this.auth.can('clinical.edit')) return; // the buttons are hidden too; this keeps every caller honest
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, letters: change(p.letters ?? []) } : p)));
  }

  /** Records that a WhatsApp message was prepared for the patient; for a visit reminder it also marks the visit as reminded. */
  logMessage(patientId: string, kind: Message['kind'], text: string, appointmentId?: string): void {
    const msg: Message = { id: crypto.randomUUID(), at: new Date().toISOString(), kind, text, status: 'prepared', ...(appointmentId ? { appointmentId } : {}) };
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, messages: [...(p.messages ?? []), msg] } : p)));
    if (appointmentId) this.markReminded(appointmentId);
  }

  /** Archiving hides a patient without deleting anything; restoring brings them back. */
  setArchived(patientId: string, on: boolean): void {
    if (!this.auth.can('patients.manage')) return; // the buttons are hidden too; this keeps every caller honest
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, archivedAt: on ? new Date().toISOString() : undefined } : p)));
  }

  setWhatsappConsent(patientId: string, value: 'granted' | 'declined' | undefined): void {
    if (!this.auth.can('patients.edit')) return; // the buttons are hidden too; this keeps every caller honest
    const at = value ? new Date().toISOString() : undefined;
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, whatsappConsent: value, whatsappConsentAt: at } : p)));
  }

  /** Appends an examination snapshot to this patient only (the record carries its own patientId; a mismatch is dropped). */
  addExamination(patientId: string, exam: Examination): void {
    if (!this.auth.can('clinical.create')) return; // the buttons are hidden too; this keeps every caller honest
    if (exam.patientId !== patientId) return;
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, examinations: [...(p.examinations ?? []), exam] } : p)));
  }

  /** Same shape as `changePlan`, for the patient's visit notes. */
  changeVisits(patientId: string, change: (visits: VisitNote[]) => VisitNote[]): void {
    if (!this.auth.can('clinical.edit')) return; // the buttons are hidden too; this keeps every caller honest
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, visits: change(p.visits ?? []) } : p)));
  }

  /** Same shape as `changePlan`, for the patient's payments. */
  changePayments(patientId: string, change: (payments: Payment[]) => Payment[]): void {
    if (!this.auth.can('billing.create')) return; // the buttons are hidden too; this keeps every caller honest
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, payments: change(p.payments ?? []) } : p)));
  }

  /** Same shape as `changePlan`, for the patient's invoices. Callers only ever append (issue) or add a credit note (cancel). */
  changeInvoices(patientId: string, change: (invoices: Invoice[]) => Invoice[]): void {
    if (!this.auth.can('billing.create')) return; // the buttons are hidden too; this keeps every caller honest
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, invoices: change(p.invoices ?? []) } : p)));
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
