import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Chair, ClinicLocation, ClinicProfile, Dentist } from '../../denteus/models/dental.models';
import { ApiSession } from './api-session.service';

interface ClinicDto { name: string; timezone: string; currency: string | null; settings: Record<string, unknown>; version: number }
type Dto = Record<string, unknown>;

/** The keys the server keeps in the clinic settings document (the rest of the location is the clinic row). */
const SETTINGS = ['legalName', 'taxId', 'bank', 'invoiceNote', 'paymentDays', 'address', 'phone', 'email', 'website', 'countryCode', 'city', 'postalCode', 'hours', 'payerTypes', 'payers', 'customProviders', 'logo'] as const;
/** The profile keys the server accepts; `closures` live in their own table. */
const PROFILE = ['state', 'displayName', 'intro', 'description', 'cover', 'gallery', 'whatsapp', 'website', 'instagram', 'facebook', 'countryCode', 'country', 'region', 'city', 'lat', 'lng', 'placeId', 'slug', 'previousSlugs', 'languages', 'services', 'specialties', 'publishedAt'] as const;
const DEFAULT_COLOR = '#2563eb';

const dropNull = (o: Dto): Dto => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const pick = (o: Dto, keys: readonly string[]): Dto => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));

export const toDentist = (r: Dto): Dentist => ({ id: String(r['id']), name: String(r['name']), specialty: String(r['specialty'] ?? ''), color: String(r['color'] ?? DEFAULT_COLOR), ...dropNull({ phone: r['phone'], email: r['email'], registration: r['registration'], hours: r['hours'] }) } as Dentist);
export const toChair = (r: Dto): Chair => ({ id: String(r['id']), name: String(r['name']), ...dropNull({ color: r['color'] }) } as Chair);
const dentistBody = (d: Dentist): Dto => ({ name: d.name, specialty: d.specialty || null, color: d.color || null, phone: d.phone || null, email: d.email || null, registration: d.registration || null, hours: d.hours ?? null });
const chairBody = (c: Chair): Dto => ({ name: c.name, color: c.color || null });

/**
 * The clinic's identity, settings, public profile, closures, dentists and chairs.
 * The app has one "location" (one account = one physical clinic): this builds it from the server's separate documents and splits it back on save.
 */
@Injectable({ providedIn: 'root' })
export class ClinicApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiSession);
  private settingsVersion = 0;
  private profileVersion = 0;
  /** Closure ids by "from|to|reason", so a save can delete exactly the ones the person removed. */
  private closureIds = new Map<string, string>();

  private get = <T>(path: string, params?: HttpParams) => firstValueFrom(this.http.get<T>(this.api.url(path), { params }));

  /** One round of reads at sign-in: the clinic, its profile, the next year of closures, and the resources (all small, bounded lists). */
  async load(clinicId: string, today = new Date()): Promise<{ location: ClinicLocation; dentists: Dentist[]; chairs: Chair[] }> {
    const from = new Date(today.getTime() - 30 * 864e5).toISOString().slice(0, 10), to = new Date(today.getTime() + 365 * 864e5).toISOString().slice(0, 10);
    const [clinic, prof, closures, dentists, chairs] = await Promise.all([
      this.get<ClinicDto>('/clinic'),
      this.get<{ profile: Dto | null; version: number }>('/clinic/profile').catch(() => ({ profile: null, version: 0 })), // the profile is owner-only
      this.get<{ items: { id: string; from: string; to: string; reason?: string }[] }>('/clinic/closures', new HttpParams().set('from', from).set('to', to)),
      this.get<{ items: Dto[] }>('/dentists'),
      this.get<{ items: Dto[] }>('/chairs'),
    ]);
    this.settingsVersion = clinic.version; this.profileVersion = prof.version;
    this.closureIds = new Map(closures.items.map((c) => [this.key(c), c.id]));
    const location: ClinicLocation = { ...(clinic.settings as object), id: clinicId, name: clinic.name, code: 'MAIN', timezone: clinic.timezone, active: true, ...(clinic.currency ? { currency: clinic.currency } : {}) } as ClinicLocation;
    const closureList = closures.items.map(({ from, to, reason }) => ({ from, to, ...(reason ? { reason } : {}) }));
    if (prof.profile || closureList.length) location.profile = { ...(prof.profile ?? { state: 'draft' }), closures: closureList } as ClinicProfile;
    return { location, dentists: dentists.items.map(toDentist), chairs: chairs.items.map(toChair) };
  }

  private key = (c: { from: string; to: string; reason?: string | null }): string => `${c.from}|${c.to}|${c.reason ?? ''}`;

  /** Saves identity + settings (and, when it changed and the signed-in person may, the public profile and closures). A 409 means someone else saved first: the caller reloads. */
  async saveLocation(next: ClinicLocation, prev: ClinicLocation | undefined, canProfile: boolean): Promise<void> {
    const settings = pick(next as unknown as Dto, SETTINGS);
    const same = prev && JSON.stringify(settings) === JSON.stringify(pick(prev as unknown as Dto, SETTINGS)) && prev.name === next.name && prev.timezone === next.timezone && prev.currency === next.currency;
    if (!same) {
      const r = await firstValueFrom(this.http.put<{ version: number }>(this.api.url('/clinic'), { expectedVersion: this.settingsVersion, name: next.name, timezone: next.timezone, ...(next.currency ? { currency: next.currency } : {}), settings }));
      this.settingsVersion = r.version;
    }
    const p = next.profile, before = prev?.profile;
    if (!canProfile || !p) return;
    const body = pick(p as unknown as Dto, PROFILE);
    if (!before || JSON.stringify(body) !== JSON.stringify(pick(before as unknown as Dto, PROFILE))) {
      const r = await firstValueFrom(this.http.put<{ version: number }>(this.api.url('/clinic/profile'), { expectedVersion: this.profileVersion, profile: body }));
      this.profileVersion = r.version;
    }
    const want = new Map((p.closures ?? []).map((c) => [this.key(c), c]));
    for (const [k, id] of this.closureIds) if (!want.has(k)) { await firstValueFrom(this.http.delete(this.api.url(`/clinic/closures/${encodeURIComponent(id)}`))); this.closureIds.delete(k); }
    for (const [k, c] of want) if (!this.closureIds.has(k)) {
      const r = await firstValueFrom(this.http.post<{ id: string }>(this.api.url('/clinic/closures'), { from: c.from, to: c.to || c.from, ...(c.reason ? { reason: c.reason } : {}) }));
      this.closureIds.set(k, r.id);
    }
  }

  /** Brings the server's list in line with `next`: new items are created (the server assigns the id), changed ones patched, removed ones archived. Returns the list as the server now has it. */
  private async sync<T extends { id: string }>(path: string, prev: T[], next: T[], body: (x: T) => Dto): Promise<T[]> {
    const had = new Map(prev.map((x) => [x.id, x]));
    const out: T[] = [];
    for (const x of next) {
      const old = had.get(x.id);
      if (!old) { const r = await firstValueFrom(this.http.post<{ id: string }>(this.api.url(path), body(x))); out.push({ ...x, id: r.id }); continue; }
      if (JSON.stringify(body(old)) !== JSON.stringify(body(x))) await firstValueFrom(this.http.patch(this.api.url(`${path}/${encodeURIComponent(x.id)}`), body(x)));
      out.push(x);
    }
    const keep = new Set(next.map((x) => x.id));
    for (const x of prev) if (!keep.has(x.id)) await firstValueFrom(this.http.post(this.api.url(`${path}/${encodeURIComponent(x.id)}/archive`), {}));
    return out;
  }
  syncDentists = (prev: Dentist[], next: Dentist[]): Promise<Dentist[]> => this.sync('/dentists', prev, next, dentistBody);
  syncChairs = (prev: Chair[], next: Chair[]): Promise<Chair[]> => this.sync('/chairs', prev, next, chairBody);
}
