import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Patient, PatientInput } from '../../denteus/models/dental.models';
import { ApiSession } from './api-session.service';

/** One page of patients. `nextCursor` is null on the last page; pass it back as `cursor` to continue. */
export interface PatientPage { items: Patient[]; nextCursor: string | null }
export interface PatientQuery { q?: string; archived?: boolean; alert?: boolean; cursor?: string | null; limit?: number }

const OPTIONAL = ['email', 'birthDate', 'sex', 'country', 'city', 'address', 'mapUrl', 'emergencyName', 'emergencyPhone', 'language', 'referral', 'alert', 'notes'] as const;

/** The API sends null for "not set"; the app's Patient type uses a missing key. Only core-record fields come this way: sections (medical, chart, invoices) load from their own endpoints. */
export const toPatient = (r: Record<string, unknown>): Patient => {
  const p: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (v !== null && v !== undefined) p[k] = v;
  delete p['photoFileId'];
  return p as unknown as Patient;
};

/** A full form save: a field left empty is sent as null so it is cleared on the server, not silently kept. */
export const toBody = (input: PatientInput): Record<string, unknown> => {
  const body: Record<string, unknown> = { fullName: input.fullName, phone: input.phone || null };
  for (const k of OPTIONAL) body[k] = input[k] || null;
  return body;
};

/** The patients endpoints. Every list call is paged and filtered by the server; nothing here loads the whole clinic. */
@Injectable({ providedIn: 'root' })
export class PatientApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiSession);

  async list(q: PatientQuery = {}): Promise<PatientPage> {
    let params = new HttpParams().set('limit', String(q.limit ?? 50));
    if (q.q?.trim()) params = params.set('q', q.q.trim());
    if (q.archived) params = params.set('archived', 'true');
    if (q.alert) params = params.set('alert', 'true');
    if (q.cursor) params = params.set('cursor', q.cursor);
    const r = await firstValueFrom(this.http.get<{ items: Record<string, unknown>[]; nextCursor: string | null }>(this.api.url('/patients'), { params }));
    return { items: r.items.map(toPatient), nextCursor: r.nextCursor };
  }
  async get(id: string): Promise<Patient> {
    return toPatient(await firstValueFrom(this.http.get<Record<string, unknown>>(this.api.url(`/patients/${encodeURIComponent(id)}`))));
  }
  create(input: PatientInput): Promise<{ id: string; number: string }> {
    return firstValueFrom(this.http.post<{ id: string; number: string }>(this.api.url('/patients'), toBody(input)));
  }
  async update(id: string, input: PatientInput): Promise<void> {
    await firstValueFrom(this.http.patch(this.api.url(`/patients/${encodeURIComponent(id)}`), toBody(input)));
  }
  async archive(id: string, on: boolean): Promise<void> {
    await firstValueFrom(this.http.post(this.api.url(`/patients/${encodeURIComponent(id)}/${on ? 'archive' : 'unarchive'}`), {}));
  }
  /** The waiting list (oldest first), at most 100 on screen. */
  async waiting(): Promise<Patient[]> {
    const r = await firstValueFrom(this.http.get<{ items: { patientId: string; number: string; fullName: string; phone?: string; since: string }[] }>(this.api.url('/waiting'), { params: new HttpParams().set('limit', '100') }));
    return r.items.map((x) => ({ id: x.patientId, number: x.number, fullName: x.fullName, phone: x.phone ?? '', waiting: { since: x.since } }));
  }
  async setWaiting(id: string): Promise<void> { await firstValueFrom(this.http.put(this.api.url(`/patients/${encodeURIComponent(id)}/waiting`), {})); }
  async clearWaiting(id: string): Promise<void> { await firstValueFrom(this.http.delete(this.api.url(`/patients/${encodeURIComponent(id)}/waiting`))); }
  /** Files that look like the same person (same phone, or a very similar name). At most 10, from the server. */
  async duplicates(id: string): Promise<Patient[]> {
    const r = await firstValueFrom(this.http.get<{ items: Record<string, unknown>[] }>(this.api.url(`/patients/${encodeURIComponent(id)}/duplicates`)));
    return r.items.map(toPatient);
  }
  /** Moves `dropId`'s records into `keepId` and archives `dropId`. The server refuses when the file holds records that must not move. */
  async merge(dropId: string, keepId: string): Promise<void> {
    await firstValueFrom(this.http.post(this.api.url(`/patients/${encodeURIComponent(dropId)}/merge`), { intoId: keepId }));
  }
}
