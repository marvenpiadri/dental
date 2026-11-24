import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { MedicalHistory, TreatmentItem } from '../../denteus/models/dental.models';
import type { Examination } from '../../denteus/odontogram/engine/exam';
import { ApiSession } from './api-session.service';

type Dto = Record<string, unknown>;
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The revision of every part of a patient's stored chart: what a change must quote to prove it saw the latest. */
export interface ChartRevs { teeth: Record<string, number>; plan: Record<string, number>; globals: number; case: number }
export interface ChartChange { scope: 'teeth' | 'plan' | 'globals' | 'case'; tooth?: string; expectedRev: number; replace?: Rec; clear?: true }
export const CHART_EDIT_REASON = 'Chart edit'; // the server wants a reason (3+ characters) whenever a change removes data from a tooth

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The smallest list of changes that turns the stored chart (`prev`) into `next`: one entry per tooth or section that differs,
 * never the whole chart. Each carries the revision it was read at (0 for a part that does not exist yet).
 */
export function diffChart(prev: Rec, next: Rec, revs: ChartRevs): ChartChange[] {
  const out: ChartChange[] = [];
  for (const scope of ['teeth', 'plan'] as const) {
    const a = isRec(prev[scope]) ? prev[scope] : {}, b = isRec(next[scope]) ? next[scope] : {};
    for (const [tooth, data] of Object.entries(b)) if (isRec(data) && Object.keys(data).length && !same(a[tooth], data)) out.push({ scope, tooth, expectedRev: revs[scope][tooth] ?? 0, replace: data });
    for (const tooth of Object.keys(a)) if (!(tooth in b) || (isRec(b[tooth]) && !Object.keys(b[tooth] as Rec).length)) out.push({ scope, tooth, expectedRev: revs[scope][tooth] ?? 0, clear: true });
  }
  const g = isRec(next['globals']) ? next['globals'] : {};
  if (Object.keys(g).length && !same(prev['globals'], g)) out.push({ scope: 'globals', expectedRev: revs.globals, replace: g });
  if (isRec(next['case'])) { if (!same(prev['case'], next['case'])) out.push({ scope: 'case', expectedRev: revs.case, replace: next['case'] }); }
  else if (prev['case'] !== undefined && prev['case'] !== null) out.push({ scope: 'case', expectedRev: revs.case, clear: true });
  return out;
}

/** Applies the new revisions the server returned, so the next save quotes them. */
export function applyRevs(revs: ChartRevs, done: { scope: ChartChange['scope']; tooth: string | null; rev: number }[]): ChartRevs {
  const out: ChartRevs = { teeth: { ...revs.teeth }, plan: { ...revs.plan }, globals: revs.globals, case: revs.case };
  for (const r of done) { if (r.scope === 'teeth' || r.scope === 'plan') out[r.scope][r.tooth!] = r.rev; else out[r.scope] = r.rev; }
  return out;
}

export const toTreatmentItem = (r: Dto, currency: string): TreatmentItem => ({
  id: String(r['id']), procedure: String(r['procedure']), price: Number(r['price']), status: r['status'] === 'done' ? 'done' : 'planned',
  ...(r['tooth'] ? { tooth: String(r['tooth']) } : {}), ...(r['scope'] ? { scope: r['scope'] as TreatmentItem['scope'] } : {}), ...(r['quadrant'] ? { quadrant: r['quadrant'] as TreatmentItem['quadrant'] } : {}),
  ...(r['name'] ? { name: String(r['name']) } : {}), ...(r['currency'] && r['currency'] !== currency ? { currency: String(r['currency']) } : {}),
  ...(r['date'] ? { date: String(r['date']) } : {}), ...(r['doneAt'] ? { doneAt: String(r['doneAt']) } : {}), ...(r['appointmentId'] ? { appointmentId: String(r['appointmentId']) } : {}),
} as TreatmentItem);

/** The server wants money as text with two decimals. */
const money = (n: number): string => n.toFixed(2);
const planBody = (i: TreatmentItem): Dto => ({ tooth: i.tooth ?? null, scope: i.scope ?? null, quadrant: i.quadrant ?? null, procedure: i.procedure, name: i.name ?? null, price: money(i.price) });

/** Medical history, the chart, examinations and the treatment plan: every call is for one patient and bounded. */
@Injectable({ providedIn: 'root' })
export class ClinicalApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiSession);
  private url = (id: string, tail: string): string => this.api.url(`/patients/${encodeURIComponent(id)}${tail}`);

  async medical(id: string): Promise<{ medical: MedicalHistory; version: number }> {
    const r = await firstValueFrom(this.http.get<{ conditions: string[]; allergies: string; medications: string; legacyMatched: string[]; version: number }>(this.url(id, '/medical')));
    return { version: r.version, medical: { ...(r.conditions.length ? { conditions: r.conditions } : {}), ...(r.allergies ? { allergies: r.allergies } : {}), ...(r.medications ? { medications: r.medications } : {}), ...(r.legacyMatched.length ? { legacyMatched: r.legacyMatched } : {}) } };
  }
  /** Saves the whole medical record (it is small and always edited as one form). A 409 means someone else saved first. */
  async saveMedical(id: string, m: MedicalHistory, expectedVersion: number): Promise<number> {
    return (await firstValueFrom(this.http.put<{ version: number }>(this.url(id, '/medical'), { expectedVersion, conditions: m.conditions ?? [], allergies: m.allergies ?? '', medications: m.medications ?? '', legacyMatched: m.legacyMatched ?? [] }))).version;
  }

  /** The stored chart and its revisions, or null when the patient has none yet. */
  async chart(id: string): Promise<{ chart: Rec; revs: ChartRevs } | null> {
    const r = await firstValueFrom(this.http.get<{ chart: Rec | null; revs?: ChartRevs }>(this.url(id, '/chart')));
    return r.chart && r.revs ? { chart: r.chart, revs: r.revs } : null;
  }
  async initChart(id: string, chart: Rec): Promise<{ chart: Rec; revs: ChartRevs }> {
    return firstValueFrom(this.http.post<{ chart: Rec; revs: ChartRevs }>(this.url(id, '/chart'), { chart, reason: 'Chart created' }));
  }
  async patchChart(id: string, changes: ChartChange[], payloadVersion?: string): Promise<{ scope: ChartChange['scope']; tooth: string | null; rev: number }[]> {
    const r = await firstValueFrom(this.http.patch<{ revs: { scope: ChartChange['scope']; tooth: string | null; rev: number }[] }>(this.url(id, '/chart'), { changes, reason: CHART_EDIT_REASON, ...(payloadVersion ? { payloadVersion } : {}) }));
    return r.revs;
  }

  /** Examinations with their frozen charts, newest first (10 per page), or oldest first with `order: 'asc'`. */
  async exams(id: string, o: { cursor?: string | null; order?: 'asc' | 'desc'; limit?: number } = {}): Promise<{ items: Examination[]; nextCursor: string | null }> {
    let params = new HttpParams().set('withCharts', 'true').set('limit', String(o.limit ?? 10)).set('order', o.order ?? 'desc');
    if (o.cursor) params = params.set('cursor', o.cursor);
    const r = await firstValueFrom(this.http.get<{ items: Dto[]; nextCursor: string | null }>(this.url(id, '/exams'), { params }));
    return { nextCursor: r.nextCursor, items: r.items.filter((x) => !x['voidedAt']).map((x) => ({ id: String(x['id']), patientId: id, date: String(x['at']).slice(0, 10), ...(x['note'] ? { note: String(x['note']) } : {}), chart: x['chart'] as Examination['chart'] })) };
  }
  /** The server snapshots the chart it has stored, so save the chart first. */
  async addExam(id: string, o: { at?: Date; note?: string; dentistId?: string }): Promise<string> {
    return (await firstValueFrom(this.http.post<{ id: string }>(this.url(id, '/exams'), { ...(o.at ? { at: o.at.toISOString() } : {}), note: o.note ?? null, dentistId: o.dentistId ?? null }))).id;
  }

  /** One page of the plan, oldest first. */
  async plan(id: string, currency: string, cursor: string | null = null): Promise<{ items: TreatmentItem[]; nextCursor: string | null }> {
    let params = new HttpParams().set('limit', '100');
    if (cursor) params = params.set('cursor', cursor);
    const r = await firstValueFrom(this.http.get<{ items: Dto[]; nextCursor: string | null }>(this.url(id, '/plan'), { params }));
    return { items: r.items.map((x) => toTreatmentItem(x, currency)), nextCursor: r.nextCursor };
  }
  /** Adds an item (done work is recorded in the same call with its own day) and returns the id the server gave it. */
  async addPlanItem(id: string, i: TreatmentItem): Promise<string> {
    return (await firstValueFrom(this.http.post<{ id: string }>(this.url(id, '/plan'), { ...planBody(i), ...(i.status === 'done' ? { status: 'done', ...(i.date ? { date: i.date } : {}), ...(i.appointmentId ? { appointmentId: i.appointmentId } : {}) } : {}) }))).id;
  }
  async editPlanItem(itemId: string, i: TreatmentItem, markDone: boolean): Promise<void> {
    await firstValueFrom(this.http.patch(this.api.url(`/plan/${encodeURIComponent(itemId)}`), { ...planBody(i), ...(markDone ? { status: 'done', ...(i.date ? { date: i.date } : {}), ...(i.appointmentId ? { appointmentId: i.appointmentId } : {}) } : {}) }));
  }
  async deletePlanItem(itemId: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.api.url(`/plan/${encodeURIComponent(itemId)}`)));
  }
}
