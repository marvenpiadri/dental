import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Appointment, AppointmentStatus, AppointmentTypeId } from '../../denteus/models/dental.models';
import { ApiSession } from './api-session.service';

type Dto = Record<string, unknown>;
export interface AppointmentPage { items: Appointment[]; nextCursor: string | null }
export interface Slot { start: Date; end: Date; dentistId: string; chairId: string }

const DAY = 864e5;
/** The server accepts at most 62 days per call; stay under it. */
export const MAX_SPAN_DAYS = 60;

/** History is not in the list (it loads on demand), so a loaded appointment starts with none. */
export const toAppointment = (r: Dto): Appointment => ({
  id: String(r['id']), patientId: String(r['patientId']), dentistId: String(r['dentistId']), chairId: String(r['chairId']),
  type: String(r['type']) as AppointmentTypeId, status: String(r['status']) as AppointmentStatus,
  start: new Date(String(r['startAt'])), end: new Date(String(r['endAt'])),
  ...(r['reason'] ? { reason: String(r['reason']) } : {}), ...(r['note'] ? { note: String(r['note']) } : {}), ...(r['remindedAt'] ? { remindedAt: String(r['remindedAt']) } : {}),
  version: Number(r['version'] ?? 0), createdAt: new Date(String(r['startAt'])), createdBy: '', history: [], scheduleHistory: [],
});

/** True when the server refused because the dentist, chair or patient is already booked at that time. */
export const isSlotTaken = (e: unknown): boolean => e instanceof HttpErrorResponse && e.status === 409 && e.error?.error?.code === 'slot_taken';
/** True when someone else changed the appointment first. */
export const isStale = (e: unknown): boolean => e instanceof HttpErrorResponse && e.status === 409 && e.error?.error?.code === 'stale';

@Injectable({ providedIn: 'root' })
export class AppointmentApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiSession);

  /** Every appointment that starts in [from, to), read in pages of 100 and in pieces of at most 60 days. `maxItems` keeps a runaway range from filling the browser. */
  async range(from: Date, to: Date, maxItems = 2000): Promise<Appointment[]> {
    const out: Appointment[] = [];
    for (let a = from.getTime(); a < to.getTime() && out.length < maxItems; a += MAX_SPAN_DAYS * DAY) {
      const b = Math.min(to.getTime(), a + MAX_SPAN_DAYS * DAY);
      let cursor: string | null = null;
      do {
        let params = new HttpParams().set('from', new Date(a).toISOString()).set('to', new Date(b).toISOString()).set('limit', '100');
        if (cursor) params = params.set('cursor', cursor);
        const r: { items: Dto[]; nextCursor: string | null } = await firstValueFrom(this.http.get<{ items: Dto[]; nextCursor: string | null }>(this.api.url('/appointments'), { params }));
        out.push(...r.items.map(toAppointment)); cursor = r.nextCursor;
      } while (cursor && out.length < maxItems);
    }
    return out;
  }

  /** One patient's appointments, newest first. */
  async ofPatient(patientId: string, cursor: string | null = null, limit = 50): Promise<AppointmentPage> {
    let params = new HttpParams().set('limit', String(limit));
    if (cursor) params = params.set('cursor', cursor);
    const r = await firstValueFrom(this.http.get<{ items: Dto[]; nextCursor: string | null }>(this.api.url(`/patients/${encodeURIComponent(patientId)}/appointments`), { params }));
    return { items: r.items.map(toAppointment), nextCursor: r.nextCursor };
  }

  async create(a: { patientId: string; dentistId: string; chairId: string; type: string; status: string; start: Date; end: Date; reason?: string; note?: string }): Promise<string> {
    const r = await firstValueFrom(this.http.post<{ id: string }>(this.api.url('/appointments'), { patientId: a.patientId, dentistId: a.dentistId, chairId: a.chairId, type: a.type, status: a.status, startAt: a.start.toISOString(), endAt: a.end.toISOString(), reason: a.reason ?? null, note: a.note ?? null }));
    return r.id;
  }
  /** Returns the appointment's new server revision. */
  async reschedule(id: string, version: number, s: Slot): Promise<number> {
    return (await firstValueFrom(this.http.post<{ version: number }>(this.api.url(`/appointments/${encodeURIComponent(id)}/reschedule`), { version, startAt: s.start.toISOString(), endAt: s.end.toISOString(), dentistId: s.dentistId, chairId: s.chairId }))).version;
  }
  /** Type, reason, note and patient (no move). An empty string clears the text. Returns the new revision. */
  async edit(id: string, version: number, change: { patientId?: string; type?: string; reason?: string; note?: string }): Promise<number> {
    return (await firstValueFrom(this.http.patch<{ version: number }>(this.api.url(`/appointments/${encodeURIComponent(id)}`), { version, ...change }))).version;
  }
  async setStatus(id: string, status: AppointmentStatus, version?: number): Promise<number> {
    return (await firstValueFrom(this.http.post<{ version: number }>(this.api.url(`/appointments/${encodeURIComponent(id)}/status`), { status, ...(version === undefined ? {} : { version }) }))).version;
  }
}
