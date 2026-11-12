import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { Patient } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { InsuranceCatalog } from '../regional/insurance.service';
import { InsuranceProvider, PatientInsurance, insuranceProblem, searchProviders, tidyInsurance } from '../regional/insurance';

type Form = { id?: string; providerId: string; providerName: string; number: string; policy: string; notes: string };
const EMPTY: Form = { providerId: '', providerName: '', number: '', policy: '', notes: '' };

/** Who covers the patient and under which number. A record here is not a claim and not a payment: it never changes a balance. */
@Component({
  selector: 'den-patient-insurance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="ins-title">
      <header class="card-head"><h2 class="card-title" id="ins-title"><i class="fa-solid fa-shield-heart" aria-hidden="true"></i>{{ t('ins.title') }}</h2>
        @if (canEdit() && !form()) { <button type="button" class="btn" (click)="open()"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('ins.add') }}</button> }</header>
      @if (form(); as f) {
        <form class="form" novalidate (submit)="$event.preventDefault(); save()">
          <div class="field">
            <span class="label">{{ t('ins.provider') }}</span>
            <input class="input" type="search" role="combobox" autocomplete="off" maxlength="120" [value]="query()" [attr.aria-label]="t('ins.provider')" [attr.aria-expanded]="!f.providerId && !!query().trim()" (input)="type($any($event.target).value)" />
            @if (f.providerId) { <span class="chip" data-tone="info">{{ f.providerName }}</span> }
            @if (!f.providerId && query().trim()) {
              <ul class="results" role="listbox">
                @for (p of matches(); track p.id) { <li><button type="button" class="pick" role="option" (click)="pick(p)">{{ p.name }}@if (p.short && p.short !== p.name) { <span class="muted"> · {{ p.short }}</span> } <span class="muted"> · {{ t(kindKey[p.kind]) }}</span></button></li> }
                @if (!exact()) { <li><button type="button" class="pick typed" (click)="addCustom()">{{ t('ins.addCustom', { name: query().trim() }) }}</button></li> }
              </ul>
            }
            @if (problem() === 'provider') { <p class="error" role="alert">{{ t('ins.err.provider') }}</p> }
            @if (customError()) { <p class="error" role="alert">{{ t('ins.err.custom') }}</p> }
          </div>
          <label class="field"><span class="label">{{ t('ins.number') }}</span><input class="input" maxlength="40" [value]="f.number" (input)="patch({ number: $any($event.target).value })" />
            @if (problem() === 'number') { <span class="error" role="alert">{{ t('ins.err.number') }}</span> }</label>
          <label class="field"><span class="label">{{ t('ins.policy') }}</span><input class="input" maxlength="60" [value]="f.policy" (input)="patch({ policy: $any($event.target).value })" /></label>
          <label class="field"><span class="label">{{ t('ins.notes') }}</span><input class="input" maxlength="300" [value]="f.notes" (input)="patch({ notes: $any($event.target).value })" /></label>
          <div class="row"><button class="btn btn--primary" type="submit">{{ t('ins.save') }}</button><button class="btn" type="button" (click)="form.set(null)">{{ t('common.cancel') }}</button></div>
        </form>
      }
      <ul class="list">
        @for (i of items(); track i.id) {
          <li><div class="grow"><strong>{{ i.providerName }}</strong><div class="muted">{{ t('ins.number') }}: {{ i.number }}@if (i.policy) { · {{ t('ins.policy') }}: {{ i.policy }} }</div>@if (i.notes) { <div class="muted">{{ i.notes }}</div> }</div>
            @if (canEdit()) { <button type="button" class="btn" (click)="edit(i)">{{ t('lib.edit') }}</button><button type="button" class="btn" (click)="remove(i)">{{ t('pm.remove') }}</button> }</li>
        }
        @if (!items().length && !form()) { <li class="muted">{{ t('ins.none') }}</li> }
      </ul>
      <p class="note muted">{{ t('ins.note') }}</p>
    </section>
  `,
  styles: `
    :host { display: block; }
    .form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 12px 16px; border-top: 1px solid var(--app-line); }
    .field { display: flex; flex-direction: column; gap: 4px; position: relative; min-width: 0; } .label { font-size: 13px; font-weight: 600; color: var(--app-muted); }
    .input { width: 100%; box-sizing: border-box; min-height: 40px; padding: 0 12px; border: 1px solid var(--app-field); border-radius: var(--radius-control, 8px); background: var(--app-panel); color: inherit; font: inherit; }
    .row { grid-column: 1 / -1; display: flex; gap: 8px; } .error { color: var(--app-danger); margin: 0; font-size: 13px; }
    .results { list-style: none; margin: 0; padding: 4px; border: 1px solid var(--app-line); border-radius: var(--radius-control, 8px); background: var(--app-panel); max-height: 240px; overflow: auto; }
    .pick { width: 100%; text-align: start; padding: 8px 10px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; border-radius: 6px; } .pick:hover, .pick:focus-visible { background: var(--app-hover); } .typed { font-style: italic; }
    .list { list-style: none; margin: 0; padding: 0; } .list li { display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--app-line); } .grow { flex: 1; min-width: 0; }
    .muted { color: var(--app-muted); font-size: 13px; } .note { margin: 0; padding: 8px 16px 12px; border-top: 1px solid var(--app-line); }
  `,
})
export class PatientInsuranceComponent {
  readonly patient = input.required<Patient>();
  protected readonly t = inject(I18n).t;
  private readonly store = inject(DentalStore);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(InsuranceCatalog);
  protected readonly form = signal<Form | null>(null);
  protected readonly query = signal('');
  protected readonly submitted = signal(false);
  protected readonly customError = signal(false);
  protected readonly canEdit = computed(() => this.auth.can('patients.edit'));
  protected readonly items = computed(() => this.patient().insurances ?? []);
  protected readonly matches = computed(() => searchProviders(this.catalog.all(), this.query()));
  protected readonly exact = computed(() => { const q = this.query().trim().toLowerCase(); return !q || this.catalog.all().some((p) => p.name.toLowerCase() === q || p.short?.toLowerCase() === q); });
  protected readonly problem = computed(() => (this.submitted() && this.form() ? insuranceProblem(this.form()!) : null));
  protected readonly kindKey: Record<InsuranceProvider['kind'], Key> = { public: 'ins.kind.public', military: 'ins.kind.military', mutual: 'ins.kind.mutual', private: 'ins.kind.private', other: 'ins.kind.other' };

  protected open(i?: PatientInsurance): void {
    void this.catalog.ensure(); // the reference list is fetched only now, never when the profile opens
    this.submitted.set(false); this.customError.set(false);
    this.form.set(i ? { id: i.id, providerId: i.providerId, providerName: i.providerName, number: i.number, policy: i.policy ?? '', notes: i.notes ?? '' } : { ...EMPTY });
    this.query.set(i?.providerName ?? '');
  }
  protected edit(i: PatientInsurance): void { this.open(i); }
  protected patch(p: Partial<Form>): void { this.form.update((f) => (f ? { ...f, ...p } : f)); }
  protected type(v: string): void { this.query.set(v); this.customError.set(false); this.patch({ providerId: '', providerName: '' }); }
  protected pick(p: InsuranceProvider): void { this.query.set(p.name); this.patch({ providerId: p.id, providerName: p.name }); }
  protected async addCustom(): Promise<void> {
    const r = await this.catalog.addCustom(this.query());
    if (typeof r === 'string') { this.customError.set(true); return; }
    this.pick(r);
  }
  protected save(): void {
    const f = this.form();
    if (!f) return;
    this.submitted.set(true);
    if (insuranceProblem(f)) return;
    const rec = tidyInsurance({ id: f.id ?? crypto.randomUUID(), providerId: f.providerId, providerName: f.providerName, number: f.number, policy: f.policy, notes: f.notes, addedAt: this.items().find((x) => x.id === f.id)?.addedAt ?? new Date().toISOString() });
    this.store.changeInsurance(this.patient().id, (l) => (f.id ? l.map((x) => (x.id === f.id ? rec : x)) : [...l, rec]));
    this.form.set(null);
  }
  protected remove(i: PatientInsurance): void { this.store.changeInsurance(this.patient().id, (l) => l.filter((x) => x.id !== i.id)); }
}
