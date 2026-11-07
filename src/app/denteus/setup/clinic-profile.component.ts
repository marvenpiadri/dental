import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { ClinicLocation, ClinicProfile, PublishState } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { MapsService, Suggestion } from '../services/maps.service';
import { changeSlug, clinicPath, displayName, freeSlug, publishProblems, slugProblem, slugify } from '../rules/clinic-profile-rules';
import { fromPlace, mapsLink } from '../rules/places-rules';
import { publicRecord } from '../rules/public-record';

interface Field { k: string; label: Key; root?: boolean; type?: string; max?: number }
const IDENTITY: Field[] = [
  { k: 'name', label: 'set.name', root: true, max: 80 },
  { k: 'displayName', label: 'prof.display', max: 80 },
];
const CONTACT: Field[] = [
  { k: 'phone', label: 'set.phone', root: true, type: 'tel', max: 30 },
  { k: 'whatsapp', label: 'prof.whatsapp', type: 'tel', max: 30 },
  { k: 'email', label: 'set.email', root: true, type: 'email', max: 80 },
  { k: 'website', label: 'prof.website', type: 'url', max: 200 },
  { k: 'instagram', label: 'prof.instagram', type: 'url', max: 200 },
  { k: 'facebook', label: 'prof.facebook', type: 'url', max: 200 },
];
const PLACE: Field[] = [
  { k: 'country', label: 'prof.country', max: 60 },
  { k: 'countryCode', label: 'prof.countryCode', max: 2 },
  { k: 'region', label: 'prof.region', max: 80 },
  { k: 'city', label: 'prof.city', max: 80 },
];
const LISTS = ['languages', 'specialties', 'services'] as const;

const resize = (file: File, max: number): Promise<string> => new Promise((done, fail) => {
  const url = URL.createObjectURL(file); const img = new Image();
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); done(c.toDataURL('image/jpeg', 0.82));
  };
  img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('image')); };
  img.src = url;
});

/** Settings → Clinic profile: the one place for clinic identity, contact, location and the public page. Every change saves at once. */
@Component({
  selector: 'den-clinic-profile',
  templateUrl: './clinic-profile.component.html',
  styleUrl: './clinic-profile.component.css',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicProfileComponent {
  private readonly store = inject(DentalStore);
  protected readonly maps = inject(MapsService);
  protected readonly t = inject(I18n).t;
  private readonly i18n = inject(I18n);
  protected readonly identity = IDENTITY; protected readonly contact = CONTACT; protected readonly place = PLACE; protected readonly lists = LISTS;
  protected readonly clinic = computed<ClinicLocation>(() => this.store.locations()[0] ?? { id: 'new', name: '', code: 'MAIN', timezone: 'UTC', active: true });
  protected readonly p = computed<ClinicProfile>(() => this.clinic().profile ?? { state: 'draft' });
  protected readonly problems = computed(() => publishProblems(this.clinic().name, this.p()));
  protected readonly suggested = computed(() => freeSlug(displayName(this.clinic()) || 'clinic', this.p().country ?? 'x', this.p().city ?? 'x', this.clinic().id, []));
  protected readonly path = computed(() => { const p = this.p(); return p.slug && p.country && p.city ? clinicPath(p.country, p.city, p.slug) : null; });
  protected readonly mapUrl = computed(() => mapsLink(this.p()));
  protected readonly slugBad = computed(() => this.p().slug ? slugProblem(this.p().slug) : null);
  protected readonly suggestions = signal<Suggestion[]>([]);
  protected readonly searching = signal(false);
  protected readonly pendingSlug = signal<string | null>(null);
  protected readonly status = signal<'saved' | 'failed' | 'needName' | 'image' | null>(null);
  protected readonly stateKey: Record<PublishState, Key> = { draft: 'prof.state.draft', published: 'prof.state.published', unpublished: 'prof.state.unpublished', closed: 'prof.state.closed' };
  protected readonly problemKey: Record<string, Key> = { name: 'prof.need.name', country: 'prof.need.country', city: 'prof.need.city', slug: 'prof.need.slug', contact: 'prof.need.contact', location: 'prof.need.location' };
  protected readonly listKey: Record<(typeof LISTS)[number], Key> = { languages: 'prof.list.languages', specialties: 'prof.list.specialties', services: 'prof.list.services' };

  protected value(f: Field): string { const v = f.root ? (this.clinic() as unknown as Record<string, unknown>)[f.k] : (this.p() as unknown as Record<string, unknown>)[f.k]; return typeof v === 'string' ? v : ''; }
  protected list(k: (typeof LISTS)[number]): string { return (this.p()[k] ?? []).join(', '); }

  private async commit(next: ClinicLocation): Promise<void> {
    try { await this.store.saveLocations([next, ...this.store.locations().slice(1)]); this.status.set('saved'); } catch { this.status.set('failed'); }
  }
  protected async setRoot(patch: Partial<ClinicLocation>): Promise<void> {
    if (patch.name !== undefined && !patch.name.trim()) { this.status.set('needName'); return; }
    await this.commit({ ...this.clinic(), ...patch });
  }
  protected async setProfile(patch: Partial<ClinicProfile>): Promise<void> { await this.commit({ ...this.clinic(), profile: { ...this.p(), ...patch } }); }
  protected edit(f: Field, raw: string): Promise<void> {
    const v = raw.trim();
    return f.root ? this.setRoot({ [f.k]: v }) : this.setProfile({ [f.k]: f.k === 'countryCode' ? v.toUpperCase() : v || undefined });
  }
  protected editList(k: (typeof LISTS)[number], raw: string): Promise<void> {
    return this.setProfile({ [k]: raw.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20) });
  }
  protected editCoord(k: 'lat' | 'lng', raw: string): Promise<void> {
    const n = Number(raw);
    return this.setProfile({ [k]: raw.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= (k === 'lat' ? 90 : 180) ? n : undefined });
  }

  protected async search(q: string): Promise<void> {
    this.searching.set(true);
    try { this.suggestions.set(await this.maps.search(q)); } catch { this.suggestions.set([]); } finally { this.searching.set(false); }
  }
  protected async pick(s: Suggestion): Promise<void> {
    try {
      const fill = fromPlace(await this.maps.details(s.placeId));
      this.suggestions.set([]);
      await this.commit({ ...this.clinic(), address: fill.address ?? this.clinic().address, profile: { ...this.p(), ...fill.profile } });
    } catch { this.status.set('failed'); }
  }

  protected editSlug(raw: string): void {
    const slug = slugify(raw);
    const p = this.p();
    if (slug === (p.slug ?? '')) return;
    if (p.slug && p.state !== 'draft') { this.pendingSlug.set(slug); return; }
    void this.setProfile(changeSlug(p, slug));
  }
  protected async confirmSlug(): Promise<void> { const s = this.pendingSlug(); this.pendingSlug.set(null); if (s && !slugProblem(s)) await this.setProfile(changeSlug(this.p(), s)); }

  protected async publish(): Promise<void> { if (!this.problems().length) await this.setProfile({ state: 'published', publishedAt: this.p().publishedAt ?? new Date().toISOString() }); }
  /** Downloads the record the server publishes (only live clinics are served from it). */
  protected exportPublic(): void {
    const record = publicRecord(this.clinic(), this.lang() === 'fr' ? 'fr' : 'en');
    if (!record) { this.status.set('failed'); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify([record], null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'public-clinics.json'; a.click(); URL.revokeObjectURL(url);
  }
  protected readonly lang = this.i18n.lang;
  protected setState(state: PublishState): Promise<void> { return this.setProfile({ state }); }

  protected async addImage(file: File | undefined, as: 'cover' | 'gallery'): Promise<void> {
    if (!file || !file.type.startsWith('image/')) { this.status.set('image'); return; }
    try {
      const url = await resize(file, as === 'cover' ? 1600 : 1200);
      await (as === 'cover' ? this.setProfile({ cover: url }) : this.setProfile({ gallery: [...(this.p().gallery ?? []), url].slice(0, 8) }));
    } catch { this.status.set('image'); }
  }
  protected removeGallery(i: number): Promise<void> { return this.setProfile({ gallery: (this.p().gallery ?? []).filter((_, j) => j !== i) }); }

  protected addClosure(from: string, to: string, reason: string): Promise<void> {
    if (!from || !to || to < from) return Promise.resolve();
    return this.setProfile({ closures: [...(this.p().closures ?? []), { from, to, reason: reason.trim() || undefined }] });
  }
  protected removeClosure(i: number): Promise<void> { return this.setProfile({ closures: (this.p().closures ?? []).filter((_, j) => j !== i) }); }
}
