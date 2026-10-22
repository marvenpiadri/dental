import { Injectable, computed, effect, signal } from '@angular/core';
import { addMinutes, formatTime, newId } from '../../calendar/utils/date.utils';
import { DEMO_CHAIRS, DEMO_DENTISTS, createSeed } from '../data/dental-seed';
import {
  ApiResult,
  Appointment,
  AppointmentDraft,
  AppointmentStatus,
  Chair,
  Dentist,
  Patient,
  STATUS_META,
} from '../models/dental.models';
import {
  Candidate,
  canTransition,
  findConflicts,
  isMovable,
  validateTiming,
} from '../rules/scheduling-rules';

const STORAGE_KEY = 'denteus-calendar-demo-v1';

/** The fields a drag or an "edit time" action may change. */
export interface RescheduleChange {
  start: Date;
  end: Date;
  dentistId?: string;
  chairId?: string;
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
 * protect against two people booking the same slot at once. Persistence here is localStorage, for demos.
 */
@Injectable()
export class DentalStore {
  readonly patients = signal<Patient[]>([]);
  readonly dentists = signal<Dentist[]>([]);
  readonly chairs = signal<Chair[]>([]);
  readonly appointments = signal<Appointment[]>([]);

  /** Recorded on every change. In the real app this is the signed-in user. */
  readonly actor = signal('Front desk');

  readonly patientMap = computed(() => new Map(this.patients().map((p) => [p.id, p])));
  readonly dentistMap = computed(() => new Map(this.dentists().map((d) => [d.id, d])));
  readonly chairMap = computed(() => new Map(this.chairs().map((c) => [c.id, c])));

  private ready = false;

  constructor() {
    effect(() => {
      const patients = this.patients();
      const appointments = this.appointments();
      if (!this.ready) return;
      this.persist(patients, appointments);
    });
  }

  /** Loads saved data, or the demo seed on first use. */
  init(useSeed: boolean): void {
    this.dentists.set(DEMO_DENTISTS);
    this.chairs.set(DEMO_CHAIRS);
    const saved = this.load();
    if (saved) {
      this.patients.set(saved.patients);
      this.appointments.set(saved.appointments);
    } else if (useSeed) {
      const seed = createSeed(new Date());
      this.patients.set(seed.patients);
      this.appointments.set(seed.appointments);
    }
    this.ready = true;
  }

  /** Clears saved demo data and loads a fresh seed relative to now. */
  resetDemo(): void {
    const seed = createSeed(new Date());
    this.patients.set(seed.patients);
    this.appointments.set(seed.appointments);
  }

  /* ------------------------------- patients ------------------------------- */

  addPatient(input: { fullName: string; phone: string }): Patient {
    const patient: Patient = { id: newId(), fullName: input.fullName.trim(), phone: input.phone.trim() };
    this.patients.update((list) => [...list, patient]);
    return patient;
  }

  /* ----------------------------- appointments ----------------------------- */

  async createAppointment(draft: AppointmentDraft): Promise<ApiResult<Appointment>> {
    if (!draft.patientId) return fail('invalid', 'Select a patient.');
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
    if (!current) return fail('not-found', 'This appointment no longer exists.');

    // once the visit is under way or over, only the free-text fields may change
    if (!isMovable(current.status)) {
      const next: Appointment = { ...current, reason: draft.reason.trim() || undefined, note: draft.note.trim() || undefined };
      this.replace(next);
      return { ok: true, value: next };
    }
    if (!draft.patientId) return fail('invalid', 'Select a patient.');

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
    if (!current) return fail('not-found', 'This appointment no longer exists.');
    if (!isMovable(current.status)) {
      return fail('forbidden', `${STATUS_META[current.status].label} appointments can't be rescheduled.`);
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
    if (!current) return fail('not-found', 'This appointment no longer exists.');
    if (!canTransition(current.status, to)) {
      return fail('forbidden', `A ${STATUS_META[current.status].label.toLowerCase()} appointment can't become ${STATUS_META[to].label.toLowerCase()}.`);
    }
    if (to === 'arrived' && current.start.toDateString() !== new Date().toDateString()) {
      return fail('forbidden', 'A patient can only be marked as arrived on the day of the appointment.');
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
    if (timing) return [timing];
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
    if (timing) return fail('invalid', timing);
    if (!this.dentistMap().has(candidate.dentistId)) return fail('invalid', 'Choose a dentist.');
    if (!this.chairMap().has(candidate.chairId)) return fail('invalid', 'Choose a treatment chair.');
    if (!this.patientMap().has(candidate.patientId)) return fail('invalid', 'Select a patient.');

    const details = this.describeConflicts(candidate);
    if (details.length) return fail('conflict', details.join(' '), details);
    return null;
  }

  private describeConflicts(candidate: Candidate): string[] {
    return findConflicts(candidate, this.appointments()).map((c) => {
      const when = `${formatTime(c.with.start)}–${formatTime(c.with.end)}`;
      const who = this.patientMap().get(c.with.patientId)?.fullName ?? 'another patient';
      switch (c.resource) {
        case 'dentist':
          return `${this.dentistMap().get(c.with.dentistId)?.name ?? 'The dentist'} is already booked ${when} (${who}).`;
        case 'chair':
          return `${this.chairMap().get(c.with.chairId)?.name ?? 'The chair'} is in use ${when} (${who}).`;
        case 'patient':
          return `${this.patientMap().get(c.with.patientId)?.fullName ?? 'The patient'} already has an appointment ${when} with ${this.dentistMap().get(c.with.dentistId)?.name ?? 'another dentist'}.`;
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

  /* ------------------------------ persistence ------------------------------ */

  private persist(patients: Patient[], appointments: Appointment[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, patients, appointments }));
    } catch {
      /* storage unavailable or full: the calendar keeps working in memory */
    }
  }

  private load(): { patients: Patient[]; appointments: Appointment[] } | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as { v: number; patients: Patient[]; appointments: Appointment[] };
      if (data.v !== 1 || !Array.isArray(data.patients) || !Array.isArray(data.appointments)) return null;
      const d = (value: string | Date) => new Date(value);
      return {
        patients: data.patients,
        appointments: data.appointments.map((a) => ({
          ...a,
          start: d(a.start),
          end: d(a.end),
          createdAt: d(a.createdAt),
          history: a.history.map((h) => ({ ...h, at: d(h.at) })),
          scheduleHistory: a.scheduleHistory.map((s) => ({ ...s, at: d(s.at), fromStart: d(s.fromStart), toStart: d(s.toStart) })),
        })),
      };
    } catch {
      return null;
    }
  }
}
