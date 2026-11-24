import { mergePatientRecords } from '../patients/merge-rules';
import { LEGACY_CURRENCY, countryName } from '../regional/regional-rules';
import { CONDITIONS, nextPatientNumber } from '../patients/patient-rules';
import { ClinicPrefs, DEFAULT_PREFS, normalizePrefs } from '../setup/prefs-rules';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { addMinutes, formatTime, newId } from '../../calendar/utils/date.utils';
import { ClinicData } from './backup';
import { parseHours } from '../rules/opening-hours';
import { I18n } from '../../core/i18n/i18n.service';
import { STATUS_LABEL } from '../utils/domain-keys';
import { AuthService } from '../../core/auth/auth.service';
import { ClinicDatabase } from './clinic-database.service';
import { ApiSession } from '../../core/api/api-session.service';
import { PatientApi, PatientQuery, PatientPage } from '../../core/api/patient-api.service';
import { ClinicApi } from '../../core/api/clinic-api.service';
import { AppointmentApi, isSlotTaken } from '../../core/api/appointment-api.service';
import { apiMessage } from '../../core/api/api.interceptor';
import { ClinicalApi, ChartRevs, applyRevs, diffChart } from '../../core/api/clinical-api.service';
import { HttpErrorResponse } from '@angular/common/http';
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
  PlanProposal,
  CatalogEntry,
  Invoice,
  Letter,
  Prescription,
  PatientAllergy,
  PatientMedication,
  Message,
  Payment,
  VisitNote,
  TreatmentItem,
} from '../models/dental.models';
import type { PatientInsurance } from '../regional/insurance';
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
  for (const key of ['email', 'birthDate', 'sex', 'country', 'city', 'address', 'mapUrl', 'emergencyName', 'emergencyPhone', 'referral', 'alert', 'notes'] as const) {
    const value = input[key]?.trim();
    if (value) (out as unknown as Record<string, string>)[key] = value;
  }
  if (input.language === 'en' || input.language === 'fr') out.language = input.language;
  const m = input.medical;
  const conditions = (m?.conditions ?? []).filter((c) => CONDITIONS.includes(c as never));
  const allergies = m?.allergies?.trim();
  const medications = m?.medications?.trim();
  if (conditions.length || allergies || medications) out.medical = { ...(conditions.length && { conditions }), ...(allergies && { allergies }), ...(medications && { medications }) };
  return out;
}

const fail = (code: 'conflict' | 'invalid' | 'forbidden' | 'not-found', message: string, details: string[] = [message]): ApiResult<never> => ({
  ok: false,
  code,
  message,
  details,
});

/** A patient's structured allergy and medication records, plus which pieces of the old free text have been confirmed as records. */
export interface MedicalRecords { allergies: PatientAllergy[]; medications: PatientMedication[]; legacyMatched?: string[] }

/**
 * Holds the clinic's data and applies every change to it.
 *
 * IMPORTANT: this is the browser-side stand-in for the Denteus API. Every method that changes data
 * is async and returns an ApiResult so it can be replaced one-to-one by an HTTP call; the rules it
 * applies (conflicts, status transitions, history) must live on the server, which also has to
 * protect against two people booking the same slot at once. The current local-first adapter persists in IndexedDB.
 */
@Injectable({ providedIn: 'root' })
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
  private readonly api = inject(ApiSession);
  private readonly patientApi = inject(PatientApi);
  private readonly clinicApi = inject(ClinicApi);
  private readonly appointmentApi = inject(AppointmentApi);
  private readonly clinicalApi = inject(ClinicalApi);
  /** Server mode, per patient: the chart as last stored (what a save is compared with), its revisions, the medical record's version, and a queue so one patient's saves never overlap. */
  private readonly serverChart = new Map<string, Record<string, unknown>>();
  private readonly chartRevs = new Map<string, ChartRevs>();
  private readonly medicalVersions = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private enqueue<T>(patientId: string, job: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(patientId) ?? Promise.resolve()).catch(() => undefined).then(job);
    this.queues.set(patientId, run);
    return run;
  }
  /** True when patients live on the server: the `patients` signal is then only a cache of the pages the screens asked for, never saved to this browser. */
  readonly server = this.api.enabled;
  private readonly i18n = inject(I18n);
  private readonly t = this.i18n.t;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly persistenceError = signal<string | null>(null);

  /** The clinic's current currency; dirhams for a clinic that never chose one. */
  readonly currency = computed(() => this.locations()[0]?.currency ?? LEGACY_CURRENCY);

  constructor() {
    effect(() => this.i18n.currency.set(this.currency()));
    // Server mode: the clinic loads when someone signs in, and everything is dropped when they sign out (another person may sign in next).
    effect(() => {
      if (!this.server) return;
      if (this.api.signedIn()) untracked(() => void this.init().catch(() => undefined));
      else untracked(() => this.reset());
    });
    effect(() => {
      const patients = this.patients();
      const appointments = this.appointments();
      if (!this.ready || this.server) return; // server mode keeps nothing in this browser
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
    if (this.server && !this.api.signedIn()) return Promise.resolve(); // nothing to read before sign-in; the sign-in effect calls this again
    return (this.initialization ??= this.load().catch((error) => {
      this.initialization = null; // let the next page retry
      this.loadFailed.set(true);
      throw error;
    }));
  }

  /** Server mode: forget the signed-out person's clinic. */
  private reset(): void {
    this.initialization = null; this.ready = false;
    this.locations.set([]); this.dentists.set([]); this.chairs.set([]); this.patients.set([]); this.appointments.set([]);
    this.loaded.set(false); this.loadFailed.set(false);
  }

  private async load(): Promise<void> {
    if (this.server) return this.loadFromServer();
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

  /** Clinic, dentists and chairs come from the server; patients and appointments are loaded in pages and date ranges by the screens that show them. Prices, wording and page settings move in stage S7 and stay in this browser until then. */
  private async loadFromServer(): Promise<void> {
    const { location, dentists, chairs } = await this.clinicApi.load(this.api.who()!.clinicId);
    this.locations.set([location]); this.dentists.set(dentists); this.chairs.set(chairs);
    this.catalog.set((await this.database.loadSetting<CatalogEntry[]>('catalog')) ?? defaultCatalog());
    this.hiddenPages.set((await this.database.loadSetting<string[]>('hiddenPages')) ?? []);
    this.view3d.set((await this.database.loadSetting<boolean>('view3d')) ?? true);
    this.prefs.set(normalizePrefs(await this.database.loadSetting<unknown>('prefs')));
    this.waTemplates.set((await this.database.loadSetting<Partial<Record<Message['kind'], string>>>('waTemplates')) ?? {});
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
    if (this.server) await this.clinicApi.saveLocation(locations[0], this.locations()[0], this.auth.can('profile.edit')); // one account = one clinic
    else await this.database.saveLocations(locations);
    this.locations.set(locations);
  }

  /** The clinic setup flow calls this when dentists or chairs are created or changed. */
  async saveResources(dentists: Dentist[], chairs: Chair[]): Promise<void> {
    if (this.server) {
      dentists = await this.clinicApi.syncDentists(this.dentists(), dentists); // the server assigns the ids of new ones
      chairs = await this.clinicApi.syncChairs(this.chairs(), chairs);
    } else await this.database.saveResources(dentists, chairs);
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

  /** Adds or refreshes patients in the cache, keeping what the server does not send (sections that load elsewhere). */
  private cache(items: Patient[]): void {
    const incoming = new Map(items.map((p) => [p.id, p]));
    this.patients.update((list) => [...list.map((p) => (incoming.has(p.id) ? { ...p, ...incoming.get(p.id)! } : p)), ...items.filter((p) => !list.some((x) => x.id === p.id))]);
  }

  /** Server mode: one page of patients (search, archived and alert filters and the sort are done by the database). */
  async loadPatients(query: PatientQuery): Promise<PatientPage> {
    const page = await this.patientApi.list(query);
    this.cache(page.items);
    return page;
  }

  /** Server mode: makes sure one patient's core record is in the cache (a profile opened from a link). Returns false when it does not exist. */
  async ensurePatient(id: string): Promise<boolean> {
    if (!this.server || this.patientMap().has(id)) return true;
    try { this.cache([await this.patientApi.get(id)]); return true; } catch { return false; }
  }

  private patch(id: string, change: Partial<Patient>): void {
    this.patients.update((list) => list.map((p) => (p.id === id ? { ...p, ...change } : p)));
  }

  /** Server mode: the patient's medical history (and the version a later save must quote). */
  async loadMedical(id: string): Promise<void> {
    const r = await this.clinicalApi.medical(id);
    this.medicalVersions.set(id, r.version);
    this.patch(id, { medical: r.medical });
  }

  /** Server mode: the clinical sections of one patient file, read when the file is opened: medical history, the chart, the plan (up to 500 items), and the examinations (the newest 10 and the first one, the baseline). A section that fails to load is skipped; the others still show. */
  async loadPatientFile(id: string): Promise<void> {
    const currency = this.currency();
    const plan = async () => { let all: TreatmentItem[] = [], cursor: string | null = null; for (let i = 0; i < 5; i++) { const r = await this.clinicalApi.plan(id, currency, cursor); all = all.concat(r.items); cursor = r.nextCursor; if (!cursor) break; } this.patch(id, { plan: all }); };
    const chart = async () => { const c = await this.clinicalApi.chart(id); if (c) { this.serverChart.set(id, c.chart); this.chartRevs.set(id, c.revs); this.patch(id, { odontogram: c.chart }); } else { this.serverChart.delete(id); this.chartRevs.delete(id); } };
    const exams = async () => {
      const [newest, first] = await Promise.all([this.clinicalApi.exams(id), this.clinicalApi.exams(id, { order: 'asc', limit: 1 })]);
      const byId = new Map([...first.items, ...newest.items].map((e) => [e.id, e]));
      this.patch(id, { examinations: [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) });
    };
    await Promise.allSettled([this.loadMedical(id), chart(), plan(), exams()]);
  }

  /** Callers validate first (patient-rules.ts); this only tidies the text and stamps the record. In server mode the server assigns the id and file number. */
  async addPatient(input: PatientInput): Promise<Patient> {
    const clean = tidy(input);
    const patient: Patient = this.server
      ? { ...clean, ...(await this.createOnServer(clean)), createdAt: new Date().toISOString() }
      : { ...clean, id: newId(), number: nextPatientNumber(this.patients()), createdAt: new Date().toISOString() };
    this.patients.update((list) => [...list, patient]);
    return patient;
  }

  private async createOnServer(clean: PatientInput): Promise<{ id: string; number: string }> {
    const created = await this.patientApi.create(clean);
    if (clean.medical && (clean.medical.conditions?.length || clean.medical.allergies || clean.medical.medications)) this.medicalVersions.set(created.id, await this.clinicalApi.saveMedical(created.id, clean.medical, 0));
    return created;
  }

  /** Folds one patient file into another: records, appointments and attached files move to `keepId`, then `dropId` is removed. Cannot be undone. In server mode the server decides what may move and throws when it refuses. */
  async mergePatients(keepId: string, dropId: string): Promise<boolean> {
    if (this.server) {
      if (keepId === dropId) return false;
      await this.patientApi.merge(dropId, keepId);
      this.appointments.update((list) => list.map((a) => (a.patientId === dropId ? { ...a, patientId: keepId } : a)));
      this.patients.update((list) => list.filter((p) => p.id !== dropId));
      this.cache([await this.patientApi.get(keepId)]);
      return true;
    }
    const keep = this.patientMap().get(keepId), drop = this.patientMap().get(dropId);
    if (!keep || !drop || keepId === dropId) return false;
    for (const d of await this.database.listDocuments(dropId)) await this.database.addDocument({ ...d, patientId: keepId });
    const merged = mergePatientRecords(keep, drop, new Date());
    this.appointments.update((list) => list.map((a) => (a.patientId === dropId ? { ...a, patientId: keepId } : a)));
    this.patients.update((list) => list.filter((p) => p.id !== dropId).map((p) => (p.id === keepId ? merged : p)));
    return true;
  }

  /** Puts a patient on, or takes them off, the waiting list. */
  setWaiting(patientId: string, waiting: boolean): void | Promise<void> {
    if (this.server) {
      return (waiting ? this.patientApi.setWaiting(patientId) : this.patientApi.clearWaiting(patientId)).then(() => this.applyWaiting(patientId, waiting));
    }
    this.applyWaiting(patientId, waiting);
  }

  private applyWaiting(patientId: string, waiting: boolean): void {
    this.patients.update((list) => list.map((p) => {
      if (p.id !== patientId) return p;
      const { waiting: _drop, ...rest } = p;
      return waiting ? { ...rest, waiting: { since: new Date().toISOString() } } : rest;
    }));
  }

  async updatePatient(id: string, input: PatientInput): Promise<Patient | null> {
    const current = this.patientMap().get(id);
    if (!current) return null;
    if (this.server) {
      const clean = tidy(input);
      await this.patientApi.update(id, clean);
      const kept = current.medical?.legacyMatched; // the form does not edit it; the server record keeps it
      const medical = { ...(clean.medical ?? {}), ...(kept?.length ? { legacyMatched: kept } : {}) };
      if (JSON.stringify(medical) !== JSON.stringify(current.medical ?? {})) this.medicalVersions.set(id, await this.clinicalApi.saveMedical(id, medical, this.medicalVersions.get(id) ?? 0));
    }
    const patient: Patient = { ...tidy(input), id, number: current.number, createdAt: current.createdAt, odontogram: current.odontogram, examinations: current.examinations, chartRecoveries: current.chartRecoveries, plan: current.plan, payments: current.payments, invoices: current.invoices, letters: current.letters, prescriptions: current.prescriptions, patientAllergies: current.patientAllergies, insurances: current.insurances, patientMedications: current.patientMedications, archivedAt: current.archivedAt, messages: current.messages, whatsappConsent: current.whatsappConsent, whatsappConsentAt: current.whatsappConsentAt, visits: current.visits, proposals: current.proposals, waiting: current.waiting, photo: current.photo }; // the form doesn't edit these, so keep them
    const matched = current.medical?.legacyMatched; // the patient form does not edit this, so keep it
    if (matched?.length) patient.medical = { ...patient.medical, legacyMatched: matched };
    this.patients.update((list) => list.map((p) => (p.id === id ? patient : p)));
    return patient;
  }

  /** Saves clinic fields on the first site (creating it when there is none). Country and city also update the public profile, so the two never disagree. */
  async patchClinic(patch: Partial<ClinicLocation>): Promise<void> {
    const base: ClinicLocation = this.locations()[0] ?? { id: crypto.randomUUID(), name: 'Dontalist', code: 'MAIN', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, active: true };
    const next: ClinicLocation = { ...base, ...patch };
    if (('countryCode' in patch || 'city' in patch) && next.profile) {
      const code = next.countryCode;
      next.profile = { ...next.profile, countryCode: code, country: code ? countryName(code, 'en') : undefined, city: next.city || undefined };
    }
    await this.saveLocations([next, ...this.locations().slice(1)]);
  }

  /** True once the clinic has any payment, invoice or finished work: then a currency change needs explicit confirmation. */
  hasFinancialRecords(): boolean {
    return this.patients().some((p) => p.payments?.length || p.invoices?.length || p.plan?.some((i) => i.status === 'done'));
  }

  /** How many payments and invoices carry no currency yet, and would be stamped with the old one on a currency change. */
  unstampedFinancialRecords(): number {
    return this.patients().reduce((n, p) => n + (p.payments ?? []).filter((x) => !x.currency).length + (p.invoices ?? []).filter((x) => !x.currency).length, 0);
  }

  /**
   * Changes the clinic's currency without touching any old amount: every payment and invoice that has no currency
   * is first stamped with the currency it was made in, so it keeps meaning what it meant. Nothing is converted.
   */
  async changeCurrency(next: string): Promise<void> {
    const old = this.currency();
    if (next === old) return;
    this.patients.update((list) => list.map((p) => ({
      ...p,
      ...(p.plan?.length && { plan: p.plan.map((x) => (x.currency ? x : { ...x, currency: old })) }),
      ...(p.payments?.length && { payments: p.payments.map((x) => (x.currency ? x : { ...x, currency: old })) }),
      ...(p.invoices?.length && { invoices: p.invoices.map((x) => (x.currency ? x : { ...x, currency: old })) }),
    })));
    await this.patchClinic({ currency: next });
  }

  /** Records (or clears, with `null`) one tooth's condition on the patient's chart. */
  /** Saves the working chart's payload on the patient. */
  setOdontogram(patientId: string, odontogram: unknown): void | Promise<void> {
    if (this.server) return this.enqueue(patientId, () => this.saveChartNow(patientId, odontogram as Record<string, unknown>)).catch((e) => this.persistenceError.set(apiMessage(e)));
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, odontogram } : p)));
  }

  /** Keeps the damaged original untouched in `chartRecoveries`, then saves the repaired chart as the working one. */
  recoverChart(patientId: string, repaired: unknown, issues: { path: string; message: string }[]): void {
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, chartRecoveries: [...(p.chartRecoveries ?? []), { at: new Date().toISOString(), raw: p.odontogram, issues }], odontogram: repaired } : p)));
  }

  /** Sets (or clears, with `undefined`) the patient's photo, a small JPEG data URL kept locally with the record. */
  setPhoto(patientId: string, photo: string | undefined): void {
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, photo } : p)));
  }

  /** Edits a patient's treatment plan: `change` receives the current list and returns the new one. */
  changePlan(patientId: string, change: (plan: TreatmentItem[]) => TreatmentItem[]): void | Promise<void> {
    if (!this.auth.can('clinical.edit')) return; // the buttons are hidden too; this keeps every caller honest
    if (this.server) return this.enqueue(patientId, () => this.syncPlan(patientId, change)).catch((e) => this.persistenceError.set(apiMessage(e)));
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, plan: change(p.plan ?? []) } : p)));
  }

  /** Server mode: sends the difference between the plan on screen and the new one: items are added (the server gives them their id), edited, marked done, or removed. On a refusal the plan is re-read from the server so the screen never shows work that was not saved. */
  private async syncPlan(id: string, change: (plan: TreatmentItem[]) => TreatmentItem[]): Promise<void> {
    const prev = this.patientMap().get(id)?.plan ?? [], next = change(prev), had = new Map(prev.map((i) => [i.id, i]));
    const fields = (i: TreatmentItem) => JSON.stringify([i.tooth, i.scope, i.quadrant, i.procedure, i.name, i.price]);
    try {
      const out: TreatmentItem[] = [];
      for (const i of next) {
        const old = had.get(i.id);
        if (!old) { out.push({ ...i, id: await this.clinicalApi.addPlanItem(id, i) }); continue; }
        const done = old.status === 'planned' && i.status === 'done';
        if (done || fields(old) !== fields(i)) await this.clinicalApi.editPlanItem(i.id, i, done);
        out.push(i);
      }
      for (const old of prev) if (!next.some((i) => i.id === old.id)) await this.clinicalApi.deletePlanItem(old.id);
      this.patch(id, { plan: out });
    } catch (e) {
      const fresh = await this.clinicalApi.plan(id, this.currency()).catch(() => null);
      if (fresh) this.patch(id, { plan: fresh.items });
      throw e;
    }
  }

  /** Server mode: stores the chart as `payload` by sending only the teeth and sections that changed, each with the revision this browser saw. A 409 means a colleague changed the same tooth first: the chart is re-read and the error is raised. */
  private async saveChartNow(id: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const stored = this.serverChart.get(id), revs = this.chartRevs.get(id);
      if (!stored || !revs) { const r = await this.clinicalApi.initChart(id, payload); this.chartRevs.set(id, r.revs); }
      else {
        const changes = diffChart(stored, payload, revs);
        if (changes.length) this.chartRevs.set(id, applyRevs(revs, await this.clinicalApi.patchChart(id, changes, typeof payload['version'] === 'string' ? payload['version'] : undefined)));
      }
      this.serverChart.set(id, payload);
      this.patch(id, { odontogram: payload });
    } catch (e) {
      const fresh = await this.clinicalApi.chart(id).catch(() => null);
      if (fresh) { this.serverChart.set(id, fresh.chart); this.chartRevs.set(id, fresh.revs); this.patch(id, { odontogram: fresh.chart }); }
      throw e;
    }
  }

  /** Server mode: the server freezes the chart it has stored as the examination, so the chart is saved before this is called. */
  private async addExaminationNow(id: string, date: string, note: string, examiner?: string): Promise<void> {
    const examId = await this.clinicalApi.addExam(id, { at: new Date(`${date}T12:00:00Z`), note: note || undefined });
    const chart = this.serverChart.get(id) as unknown as Examination['chart'];
    this.patch(id, { examinations: [...(this.patientMap().get(id)?.examinations ?? []), { id: examId, patientId: id, date, ...(examiner ? { examiner } : {}), ...(note ? { note } : {}), chart: structuredClone(chart) }] });
  }

  /**
   * The chart's "record work" button: the items go on the plan, the chart gets the finding (or planned mark) and an examination is
   * frozen. The first time, the chart as it was before this work is frozen too: it is the baseline the Initial view shows.
   * In server mode the order is chart, examination, plan, and any refusal is thrown so the panel can show it.
   */
  async recordProcedure(w: { patientId: string; items: TreatmentItem[]; before: Record<string, unknown>; after: Record<string, unknown>; date: string; name: string; baselineNote: string }): Promise<void> {
    const id = w.patientId;
    if (!this.server) {
      this.changePlan(id, (plan) => [...plan, ...w.items]);
      this.setOdontogram(id, w.after);
      if (!this.patientMap().get(id)?.examinations?.length) this.addExamination(id, { patientId: id, id: crypto.randomUUID(), date: w.date, note: w.baselineNote, chart: structuredClone(w.before) as unknown as Examination['chart'] });
      this.addExamination(id, { patientId: id, id: crypto.randomUUID(), date: w.date, note: w.name, chart: structuredClone(w.after) as unknown as Examination['chart'] });
      return;
    }
    return this.enqueue(id, async () => {
      try {
        if (!this.serverChart.has(id)) await this.saveChartNow(id, w.before);
        if (!this.patientMap().get(id)?.examinations?.length) await this.addExaminationNow(id, w.date, w.baselineNote);
        await this.saveChartNow(id, w.after);
        await this.addExaminationNow(id, w.date, w.name);
        const added: TreatmentItem[] = [];
        for (const i of w.items) added.push({ ...i, id: await this.clinicalApi.addPlanItem(id, i) });
        this.patch(id, { plan: [...(this.patientMap().get(id)?.plan ?? []), ...added] });
      } catch (e) { await this.loadPatientFile(id); throw e; }
    });
  }

  /** Remembers that a reminder was sent, so the front desk doesn't message the same patient twice. */
  markReminded(appointmentId: string): void {
    const at = new Date().toISOString();
    this.appointments.update((list) => list.map((a) => (a.id === appointmentId ? { ...a, remindedAt: at } : a)));
  }

  /** Same shape as `changePlan`, for the patient's quote versions. */
  changeProposals(patientId: string, change: (list: PlanProposal[]) => PlanProposal[]): void {
    if (!this.auth.can('clinical.edit')) return;
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, proposals: change(p.proposals ?? []) } : p)));
  }

  /** Same shape as `changePlan`, for the patient's letters. Callers only append. */
  changeLetters(patientId: string, change: (letters: Letter[]) => Letter[]): void {
    if (!this.auth.can('clinical.edit')) return; // the buttons are hidden too; this keeps every caller honest
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, letters: change(p.letters ?? []) } : p)));
  }

  /** The patient's structured allergies and medications. `change` receives both lists and returns the new ones. */
  changeMedical(patientId: string, change: (r: MedicalRecords) => MedicalRecords): void {
    if (!this.auth.can('clinical.edit')) return;
    this.patients.update((list) => list.map((p) => {
      if (p.id !== patientId) return p;
      const r = change({ allergies: p.patientAllergies ?? [], medications: p.patientMedications ?? [], legacyMatched: p.medical?.legacyMatched ?? [] });
      const matched = r.legacyMatched ?? [];
      return { ...p, patientAllergies: r.allergies, patientMedications: r.medications, ...(matched.length ? { medical: { ...p.medical, legacyMatched: matched } } : {}) };
    }));
  }

  /** Replaces a patient's insurance records. Only people who may edit patients can. */
  changeInsurance(patientId: string, change: (list: PatientInsurance[]) => PatientInsurance[]): void {
    if (!this.auth.can('patients.edit')) return;
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, insurances: change(p.insurances ?? []) } : p)));
  }

  /** Same shape as `changeLetters`, for the patient's prescriptions. Issued ones are changed only by the rules in rx-rules.ts. */
  changePrescriptions(patientId: string, change: (list: Prescription[]) => Prescription[]): void {
    if (!this.auth.can('clinical.edit')) return;
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, prescriptions: change(p.prescriptions ?? []) } : p)));
  }

  /** Records that a WhatsApp message was prepared for the patient; for a visit reminder it also marks the visit as reminded. */
  logMessage(patientId: string, kind: Message['kind'], text: string, appointmentId?: string): void {
    const msg: Message = { id: crypto.randomUUID(), at: new Date().toISOString(), kind, text, status: 'prepared', ...(appointmentId ? { appointmentId } : {}) };
    this.patients.update((list) => list.map((p) => (p.id === patientId ? { ...p, messages: [...(p.messages ?? []), msg] } : p)));
    if (appointmentId) this.markReminded(appointmentId);
  }

  /** Archiving hides a patient without deleting anything; restoring brings them back. */
  async setArchived(patientId: string, on: boolean): Promise<void> {
    if (!this.auth.can('patients.manage')) return; // the buttons are hidden too; this keeps every caller honest
    if (this.server) await this.patientApi.archive(patientId, on);
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
    if (this.server) { void this.enqueue(patientId, () => this.addExaminationNow(patientId, exam.date, exam.note ?? '', exam.examiner)).catch((e) => this.persistenceError.set(apiMessage(e))); return; }
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

  /** Server mode: loads the appointments that start in [from, to) and replaces what was cached for that window (so a cancelled or moved one disappears). */
  async loadAppointments(from: Date, to: Date): Promise<void> {
    const fresh = await this.appointmentApi.range(from, to);
    const ids = new Set(fresh.map((a) => a.id));
    this.appointments.update((list) => [...list.filter((a) => !ids.has(a.id) && !(a.start >= from && a.start < to)), ...fresh]);
  }

  /** Server mode: one more page of a patient's appointments (newest first). Returns the cursor for the next page, or null. */
  async loadPatientAppointments(patientId: string, cursor: string | null = null): Promise<string | null> {
    const page = await this.appointmentApi.ofPatient(patientId, cursor);
    const ids = new Set(page.items.map((a) => a.id));
    this.appointments.update((list) => [...list.filter((a) => !ids.has(a.id)), ...page.items]);
    return page.nextCursor;
  }

  /** Server mode: the waiting list, as the server has it. Patients that left it lose their mark in the cache. */
  async loadWaiting(): Promise<void> {
    const rows = await this.patientApi.waiting();
    const on = new Map(rows.map((p) => [p.id, p.waiting!.since]));
    this.cache(rows.map(({ waiting: _w, ...p }) => p));
    this.patients.update((list) => list.map((p) => {
      const { waiting: _drop, ...rest } = p;
      return on.has(p.id) ? { ...rest, waiting: { since: on.get(p.id)! } } : rest;
    }));
  }

  /** What a refused server call means for the screen: a taken slot or a concurrent edit is a conflict; the server's own wording is shown. */
  private refused(e: unknown): ApiResult<never> {
    const status = e instanceof HttpErrorResponse ? e.status : 0;
    const code = isSlotTaken(e) || status === 409 ? 'conflict' : status === 403 ? 'forbidden' : status === 404 ? 'not-found' : 'invalid';
    const message = apiMessage(e, this.t('er.denied'));
    return fail(code, message);
  }

  async createAppointment(draft: AppointmentDraft): Promise<ApiResult<Appointment>> {
    if (!this.auth.can('appointments.create')) return fail('forbidden', this.t('er.denied'));
    if (!draft.patientId) return fail('invalid', this.t('er.select'));
    const candidate = this.candidateOf(draft);
    const problem = this.check(candidate);
    if (problem) return problem;

    const now = new Date();
    const status: AppointmentStatus = draft.status === 'confirmed' ? 'confirmed' : 'scheduled';
    let id = newId();
    if (this.server) {
      try { id = await this.appointmentApi.create({ patientId: draft.patientId, dentistId: draft.dentistId, chairId: draft.chairId, type: draft.type, status, start: candidate.start, end: candidate.end, reason: draft.reason.trim() || undefined, note: draft.note.trim() || undefined }); } catch (e) { return this.refused(e); }
    }
    const appointment: Appointment = {
      id,
      ...(this.server ? { version: 1 } : {}),
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
      createdBy: this.api.who()?.name ?? this.actor(),
      history: [{ from: null, to: status, at: now, by: this.api.who()?.name ?? this.actor() }],
      scheduleHistory: [],
    };
    this.appointments.update((list) => [...list, appointment]);
    return { ok: true, value: appointment };
  }

  /** Full edit from the booking form. Keeps the same appointment (identity and history). */
  async updateAppointment(id: string, draft: AppointmentDraft): Promise<ApiResult<Appointment>> {
    if (!this.auth.can('appointments.edit')) return fail('forbidden', this.t('er.denied'));
    const current = this.find(id);
    if (!current) return fail('not-found', this.t('er.gone'));

    // once the visit is under way or over, only the free-text fields may change
    if (!isMovable(current.status)) {
      let version = current.version;
      if (this.server) {
        try { version = await this.appointmentApi.edit(id, current.version ?? 0, { reason: draft.reason.trim(), note: draft.note.trim() }); } catch (e) { return this.refused(e); }
      }
      const next: Appointment = { ...current, reason: draft.reason.trim() || undefined, note: draft.note.trim() || undefined, ...(version === undefined ? {} : { version }) };
      this.replace(next);
      return { ok: true, value: next };
    }
    if (!draft.patientId) return fail('invalid', this.t('er.select'));

    const candidate = { ...this.candidateOf(draft), id };
    const problem = this.check(candidate);
    if (problem) return problem;

    let version = current.version;
    if (this.server) {
      try {
        const reason = draft.reason.trim(), note = draft.note.trim();
        if (draft.patientId !== current.patientId || draft.type !== current.type || reason !== (current.reason ?? '') || note !== (current.note ?? '')) version = await this.appointmentApi.edit(id, version ?? 0, { patientId: draft.patientId, type: draft.type, reason, note });
        if (candidate.start.getTime() !== current.start.getTime() || candidate.end.getTime() !== current.end.getTime() || draft.dentistId !== current.dentistId || draft.chairId !== current.chairId) version = await this.appointmentApi.reschedule(id, version ?? 0, { start: candidate.start, end: candidate.end, dentistId: draft.dentistId, chairId: draft.chairId });
      } catch (e) { return this.refused(e); }
    }
    let next: Appointment = {
      ...current,
      ...(version === undefined ? {} : { version }),
      patientId: draft.patientId,
      type: draft.type,
      reason: draft.reason.trim() || undefined,
      note: draft.note.trim() || undefined,
    };
    next = this.withSchedule(next, candidate.start, candidate.end, draft.dentistId, draft.chairId);
    this.replace(next);
    return { ok: true, value: next };
  }

  /** What `reschedule` would refuse, without changing anything: lets the calendar warn while the block is still being dragged. */
  rescheduleProblem(id: string, change: RescheduleChange): string | null {
    const current = this.find(id);
    if (!current) return this.t('er.gone');
    if (!isMovable(current.status)) return this.t('er.nomove', { s: this.t(STATUS_LABEL[current.status]) });
    const problem = this.check({ id, patientId: current.patientId, dentistId: change.dentistId ?? current.dentistId, chairId: change.chairId ?? current.chairId, start: change.start, end: change.end });
    return problem && !problem.ok ? problem.message : null;
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

    let version = current.version;
    if (this.server) {
      try { version = await this.appointmentApi.reschedule(id, version ?? 0, { start: change.start, end: change.end, dentistId, chairId }); } catch (e) { return this.refused(e); }
    }
    const next = { ...this.withSchedule(current, change.start, change.end, dentistId, chairId), ...(version === undefined ? {} : { version }) };
    this.replace(next);
    return { ok: true, value: next };
  }

  /** Completing a visit with no recorded act and no note is allowed, but only after the user confirms it. */
  confirmCompletion(id: string): boolean {
    const a = this.find(id);
    const p = a && this.patientMap().get(a.patientId);
    if (!a || !p || (p.plan ?? []).some((i) => i.appointmentId === id) || (p.visits ?? []).some((v) => v.appointmentId === id)) return true;
    return confirm(this.t('visit.emptyConfirm'));
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
    let version = current.version;
    if (this.server) {
      try { version = await this.appointmentApi.setStatus(id, to, version); } catch (e) { return this.refused(e); }
    }
    const now = new Date();
    const next: Appointment = {
      ...current,
      ...(version === undefined ? {} : { version }),
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
    if (!this.server && !this.patientMap().has(candidate.patientId)) return fail('invalid', this.t('er.select')); // server mode: the cache is partial, the server checks

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
