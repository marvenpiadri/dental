import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { I18n, Key } from '../core/i18n/i18n.service';
import { ApiSession } from '../core/api/api-session.service';
import { apiMessage } from '../core/api/api.interceptor';
import { clinicPath, slugify } from '../denteus/rules/clinic-profile-rules';

type Sub = 'active' | 'upcoming' | 'expired' | 'none';
interface Row { id: string; name: string; city: string | null; slug: string | null; state: string; ownerEmail: string | null; startsOn: string | null; endsOn: string | null; subscription: Sub }
interface Period { id: string; startsOn: string; endsOn: string; note: string | null }
type Prof = Record<string, unknown>;
interface Detail { id: string; name: string; timezone: string; ownerEmail: string | null; address: string | null; phone: string | null; profile: Prof | null; version: number; subscriptions: Period[] }

const PAGE = 25, STORE = 'dl-admin';
const STATES = ['draft', 'published', 'unpublished', 'closed'] as const;
const LANGS = [['fr', 'Français'], ['ar', 'العربية'], ['en', 'English'], ['es', 'Español']] as const;
const ZONES = ['Africa/Casablanca', 'Europe/Paris', 'UTC'] as const;
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const range = (g: AbstractControl): ValidationErrors | null => { const s = g.get('startsOn')?.value as string, e = g.get('endsOn')?.value as string; return s && e && e < s ? { range: true } : null; };

/** The operator's console: only Dontalist's owner creates clinic accounts, public profiles and subscriptions. Clinics edit their own public details later from Setup. */
@Component({
  selector: 'den-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgTemplateOutlet],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent {
  protected readonly t = inject(I18n).t;
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiSession);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly enabled = this.api.enabled;
  protected readonly states = STATES;
  protected readonly langs = LANGS;
  protected readonly zones = ZONES;

  protected readonly token = signal(this.browser ? this.stored() : '');
  protected readonly unlocked = signal(false);
  protected readonly view = signal<'list' | 'form' | 'created'>('list');
  protected readonly editing = signal<Detail | null>(null);
  protected readonly rows = signal<Row[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly query = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal('');
  protected readonly note = signal('');
  protected readonly created = signal<{ email: string; password: string } | null>(null);
  protected readonly copied = signal(false);
  protected readonly submitted = signal(false);
  protected readonly last = computed(() => Math.min(this.total(), this.offset() + PAGE));

  protected readonly form = this.fb.group({
    clinicName: ['', [Validators.required, Validators.maxLength(200)]],
    owner: this.fb.group({ name: ['', [Validators.required, Validators.maxLength(200)]], email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]] }),
    timezone: ['Africa/Casablanca'],
    state: ['draft' as (typeof STATES)[number]],
    displayName: ['', [Validators.required, Validators.maxLength(120)]],
    intro: ['', Validators.maxLength(300)],
    description: ['', Validators.maxLength(4000)],
    country: ['Maroc', [Validators.required, Validators.maxLength(64)]],
    countryCode: ['MA', [Validators.required, Validators.pattern(/^[A-Za-z]{2}$/)]],
    region: ['', Validators.maxLength(100)],
    city: ['', [Validators.required, Validators.maxLength(100)]],
    slug: ['', [Validators.required, Validators.maxLength(80), Validators.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)]],
    address: ['', Validators.maxLength(300)],
    phone: ['', Validators.maxLength(40)],
    whatsapp: ['', Validators.maxLength(40)],
    website: ['', [Validators.maxLength(200), Validators.pattern(/^$|^https?:\/\/\S+$/)]],
    instagram: ['', Validators.maxLength(100)],
    facebook: ['', Validators.maxLength(100)],
    languages: [['fr'] as string[]],
    specialties: ['', Validators.maxLength(1000)],
    services: ['', Validators.maxLength(2000)],
    subscription: this.fb.group({ startsOn: ['', Validators.required], endsOn: ['', Validators.required], note: ['', Validators.maxLength(500)] }, { validators: range }),
  });
  protected readonly period = this.fb.group({ startsOn: ['', Validators.required], endsOn: ['', Validators.required], note: ['', Validators.maxLength(500)] }, { validators: range });

  constructor() {
    // The web address follows the public name until it is typed by hand.
    this.form.controls.displayName.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((v) => { const s = this.form.controls.slug; if (!s.dirty) s.setValue(slugify(v, 80), { emitEvent: false }); });
    if (this.browser && this.token()) void this.unlock();
  }

  private stored(): string { try { return sessionStorage.getItem(STORE) ?? ''; } catch { return ''; } }
  private remember(v: string): void { try { if (v) sessionStorage.setItem(STORE, v); else sessionStorage.removeItem(STORE); } catch { /* private mode: the token stays in memory only */ } }
  private call<T>(method: string, path: string, body?: unknown, params?: Record<string, string | number>): Promise<T> {
    return firstValueFrom(this.http.request<T>(method, this.api.url('/admin' + path), { body, params, headers: { 'x-dontalist-admin': this.token() } }));
  }
  private fail(e: unknown): void {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 404) { this.unlocked.set(false); this.remember(''); this.problem.set(this.t('admin.badToken')); } else this.problem.set(apiMessage(e));
  }

  protected setToken(v: string): void { this.token.set(v.trim()); }
  protected async unlock(): Promise<void> {
    this.busy.set(true); this.problem.set('');
    try { await this.load(0); this.unlocked.set(true); this.remember(this.token()); } catch (e) { this.fail(e); } finally { this.busy.set(false); }
  }
  protected lock(): void { this.token.set(''); this.remember(''); this.unlocked.set(false); this.rows.set([]); this.view.set('list'); }

  protected async load(offset: number, q = this.query()): Promise<void> {
    const r = await this.call<{ total: number; items: Row[] }>('GET', '/clinics', undefined, { limit: PAGE, offset, ...(q ? { q } : {}) });
    this.rows.set(r.items); this.total.set(r.total); this.offset.set(offset); this.query.set(q);
  }
  protected async go(offset: number): Promise<void> { this.busy.set(true); try { await this.load(offset); } catch (e) { this.fail(e); } finally { this.busy.set(false); } }
  protected async search(q: string): Promise<void> { this.busy.set(true); try { await this.load(0, q.trim()); } catch (e) { this.fail(e); } finally { this.busy.set(false); } }

  protected openNew(): void {
    this.editing.set(null); this.problem.set(''); this.note.set(''); this.submitted.set(false);
    this.form.reset(); this.form.controls.owner.enable(); this.form.controls.subscription.enable(); this.form.controls.slug.markAsPristine();
    const y = new Date().toISOString().slice(0, 10), next = new Date(Date.parse(y) + 365 * 864e5 - 864e5).toISOString().slice(0, 10);
    this.form.controls.subscription.patchValue({ startsOn: y, endsOn: next });
    this.view.set('form');
  }
  protected async openEdit(id: string): Promise<void> {
    this.busy.set(true); this.problem.set(''); this.note.set('');
    try {
      const d = await this.call<Detail>('GET', '/clinics/' + id), p = d.profile ?? {}, s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : ''), arr = (k: string) => (Array.isArray(p[k]) ? (p[k] as string[]) : []);
      this.form.reset(); this.form.controls.owner.disable(); this.form.controls.subscription.disable(); this.submitted.set(false);
      this.form.patchValue({ clinicName: d.name, timezone: d.timezone, state: (STATES as readonly string[]).includes(s('state')) ? (s('state') as (typeof STATES)[number]) : 'draft', displayName: s('displayName'), intro: s('intro'), description: s('description'), country: s('country') || (d.profile ? '' : 'Maroc'), countryCode: s('countryCode') || (d.profile ? '' : 'MA'), region: s('region'), city: s('city'),
        slug: s('slug'), address: d.address ?? '', phone: d.phone ?? '', whatsapp: s('whatsapp'), website: s('website'), instagram: s('instagram'), facebook: s('facebook'), languages: arr('languages'), specialties: arr('specialties').join(', '), services: arr('services').join(', ') });
      this.form.controls.slug.markAsDirty(); this.editing.set(d); this.period.reset(); this.view.set('form');
    } catch (e) { this.fail(e); } finally { this.busy.set(false); }
  }
  protected back(): void { this.view.set('list'); this.created.set(null); this.problem.set(''); void this.go(this.offset()); }

  protected toggleLang(code: string, on: boolean): void { const c = this.form.controls.languages, v = c.value.filter((x) => x !== code); c.setValue(on ? [...v, code] : v); c.markAsDirty(); }
  protected pathHint(): string { const v = this.form.getRawValue(); return clinicPath(v.country, v.city, v.slug); }

  /** Fields the form owns. An empty value removes the key; everything else the clinic set itself (map position, old addresses) is kept on edit. */
  private profile(prev: Prof): Prof {
    const v = this.form.getRawValue(), out: Prof = { ...prev }, set = (k: string, x: unknown) => { if (x === '' || x === undefined || (Array.isArray(x) && !x.length)) delete out[k]; else out[k] = x; };
    for (const [k, x] of Object.entries({ state: v.state, displayName: v.displayName.trim(), intro: v.intro.trim(), description: v.description.trim(), country: v.country.trim(), countryCode: v.countryCode.trim().toUpperCase(), region: v.region.trim(), city: v.city.trim(), slug: v.slug,
      whatsapp: v.whatsapp.trim(), website: v.website.trim(), instagram: v.instagram.trim(), facebook: v.facebook.trim(), languages: v.languages, specialties: list(v.specialties), services: list(v.services) })) set(k, x);
    const old = typeof prev['slug'] === 'string' ? (prev['slug'] as string) : '';
    if (old && old !== v.slug && prev['state'] === 'published') out['previousSlugs'] = [...new Set([...(Array.isArray(prev['previousSlugs']) ? (prev['previousSlugs'] as string[]) : []).filter((x) => x !== v.slug), old])].slice(-20);
    return out;
  }
  protected err(name: string): Key | '' {
    const c = this.form.get(name); if (!c || !c.invalid || !(c.touched || this.submitted())) return '';
    return c.hasError('required') ? 'admin.err.required' : c.hasError('email') ? 'admin.err.email' : c.hasError('maxlength') ? 'admin.err.max' : name.endsWith('slug') ? 'admin.err.slug' : name.endsWith('countryCode') ? 'admin.err.code' : name.endsWith('website') ? 'admin.err.url' : 'admin.err.required';
  }
  protected rangeErr(g: AbstractControl): boolean { return g.hasError('range') && (g.touched || this.submitted()); }

  protected async save(): Promise<void> {
    this.submitted.set(true); this.problem.set(''); this.note.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); this.problem.set(this.t('admin.fixErrors')); queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('form .ng-invalid[id]')?.focus()); return; }
    const v = this.form.getRawValue(), d = this.editing();
    this.busy.set(true);
    try {
      if (d) {
        const r = await this.call<{ version: number }>('PUT', '/clinics/' + d.id, { expectedVersion: d.version, clinicName: v.clinicName.trim(), profile: this.profile(d.profile ?? {}), address: v.address.trim(), phone: v.phone.trim() });
        this.editing.set({ ...d, version: r.version, name: v.clinicName.trim() }); await this.openEdit(d.id); this.note.set(this.t('admin.saved'));
      } else {
        const r = await this.call<{ ownerEmail: string; temporaryPassword: string }>('POST', '/clinics', { clinicName: v.clinicName.trim(), timezone: v.timezone, owner: { name: v.owner.name.trim(), email: v.owner.email.trim() }, profile: this.profile({}), address: v.address.trim(), phone: v.phone.trim(), subscription: { startsOn: v.subscription.startsOn, endsOn: v.subscription.endsOn, note: v.subscription.note.trim() } });
        this.created.set({ email: r.ownerEmail, password: r.temporaryPassword }); this.view.set('created');
      }
    } catch (e) { this.fail(e); } finally { this.busy.set(false); }
  }

  protected async addPeriod(): Promise<void> {
    const d = this.editing(); if (!d) return;
    if (this.period.invalid) { this.period.markAllAsTouched(); return; }
    this.busy.set(true); this.problem.set('');
    try { const v = this.period.getRawValue(); await this.call('POST', `/clinics/${d.id}/subscriptions`, { startsOn: v.startsOn, endsOn: v.endsOn, note: v.note.trim() }); await this.openEdit(d.id); this.note.set(this.t('admin.saved')); } catch (e) { this.fail(e); } finally { this.busy.set(false); }
  }
  protected async removePeriod(id: string): Promise<void> {
    const d = this.editing(); if (!d || !confirm(this.t('admin.removeAsk'))) return;
    this.busy.set(true); this.problem.set('');
    try { await this.call('DELETE', `/clinics/${d.id}/subscriptions/${id}`); await this.openEdit(d.id); } catch (e) { this.fail(e); } finally { this.busy.set(false); }
  }
  protected async copy(text: string): Promise<void> { try { await navigator.clipboard.writeText(text); this.copied.set(true); } catch { this.copied.set(false); } }
  protected subText(r: Row): string { return r.subscription === 'none' ? this.t('admin.sub.none') : this.t(('admin.sub.' + r.subscription) as Key, { date: (r.subscription === 'upcoming' ? r.startsOn : r.endsOn) ?? '' }); }
  protected stateText(s: string): string { return (STATES as readonly string[]).includes(s) ? this.t(('admin.state.' + s) as Key) : s; }
}
