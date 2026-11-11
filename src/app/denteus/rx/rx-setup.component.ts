import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { CONDITIONS } from '../patients/patient-rules';
import { Medication, RxTemplate } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { RxItemsComponent } from './rx-items.component';
import { RxLibrary } from './rx-library.service';
import { itemTitle } from './rx-rules';

const text = (v: string | undefined): string | undefined => (v?.trim() ? v.trim() : undefined);
type MedField = 'name' | 'brand' | 'generic' | 'strength' | 'form' | 'route' | 'instructions' | 'aliases';

/** Setup > Prescribing: the clinic's medication list, its saved prescriptions and the logo printed on prescriptions. */
@Component({
  selector: 'den-rx-setup',
  imports: [RxItemsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="rx-logo">
      <header class="card-head"><h2 class="card-title" id="rx-logo"><i class="fa-solid fa-image" aria-hidden="true"></i>{{ t('rx.logo.title') }}</h2></header>
      <div class="body logo">
        @if (logo(); as l) { <img [src]="l" alt="" /> }
        <div>
          <p class="hint">{{ t('rx.logo.hint') }}</p>
          <label class="btn"><i class="fa-solid fa-upload" aria-hidden="true"></i>{{ t('rx.logo.choose') }}<input type="file" accept="image/png,image/jpeg" hidden (change)="chooseLogo($event)" /></label>
          @if (logo()) { <button type="button" class="btn" (click)="saveLogo(undefined)">{{ t('rx.logo.remove') }}</button> }
        </div>
      </div>
    </section>

    <section class="card" aria-labelledby="rx-meds">
      <header class="card-head"><h2 class="card-title" id="rx-meds"><i class="fa-solid fa-pills" aria-hidden="true"></i>{{ t('rx.med.title') }}</h2>
        <button type="button" class="btn" (click)="newMed()"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('rx.med.add') }}</button></header>
      <div class="body">
        <p class="hint">{{ t('rx.med.intro') }}</p>
        @if (med(); as m) {
          <form class="form" novalidate (submit)="$event.preventDefault(); saveMed()">
            @for (f of medFields; track f.id) {
              <label class="field" [class.wide]="f.wide"><span class="label">{{ t(f.key) }}</span>
                <input class="input" [value]="m[f.id] ?? ''" maxlength="120" (input)="patchMed(f.id, $any($event.target).value)" [attr.aria-invalid]="f.id === 'name' && nameMissing() ? 'true' : null" /></label>
            }
            <p class="hint wide">{{ t('rx.med.aliases.hint') }}</p>
            <fieldset class="wide conds"><legend class="label">{{ t('rx.med.review') }}</legend>
              @for (c of conditions; track c) {
                <label class="check"><input type="checkbox" [checked]="(m.reviewConditions ?? []).includes(c)" (change)="toggleCondition(c)" />{{ t($any('med.' + c)) }}</label>
              }
            </fieldset>
            <div class="wide actions"><button class="btn btn--primary" type="submit">{{ t('rx.med.save') }}</button><button class="btn" type="button" (click)="med.set(null)">{{ t('common.cancel') }}</button></div>
          </form>
        }
        @if (!meds().length) { <p class="hint">{{ t('rx.med.empty') }}</p> }
        <ul class="rows">
          @for (m of meds(); track m.id) {
            <li [class.dim]="m.archivedAt"><span class="grow">{{ title(m) }}@if (m.generic) { <small> · {{ m.generic }}</small> }</span>
              <button type="button" class="btn" (click)="med.set({ ...m })">{{ t('rx.edit') }}</button>
              <button type="button" class="btn" (click)="archive(m)">{{ t(m.archivedAt ? 'rx.med.restore' : 'rx.med.archive') }}</button></li>
          }
        </ul>
      </div>
    </section>

    <section class="card" aria-labelledby="rx-tpl">
      <header class="card-head"><h2 class="card-title" id="rx-tpl"><i class="fa-solid fa-file-prescription" aria-hidden="true"></i>{{ t('rx.tpl.title') }}</h2>
        <button type="button" class="btn" (click)="newTpl()"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('rx.tpl.add') }}</button></header>
      <div class="body">
        @if (tpl(); as x) {
          <form class="form" novalidate (submit)="$event.preventDefault(); saveTpl()">
            <label class="field wide"><span class="label">{{ t('rx.tpl.name') }}</span><input class="input" [value]="x.name" maxlength="80" (input)="patchTpl({ name: $any($event.target).value })" [attr.aria-invalid]="tplInvalid() ? 'true' : null" /></label>
            <label class="field wide"><span class="label">{{ t('rx.tpl.description') }}</span><input class="input" [value]="x.description ?? ''" maxlength="200" (input)="patchTpl({ description: $any($event.target).value })" /></label>
            <div class="wide"><den-rx-items [items]="x.items" (itemsChange)="patchTpl({ items: $event })" /></div>
            @if (tplInvalid()) { <p class="error wide" role="alert">{{ t('rx.err.empty') }}</p> }
            <div class="wide actions"><button class="btn btn--primary" type="submit">{{ t('rx.tpl.save') }}</button><button class="btn" type="button" (click)="tpl.set(null)">{{ t('common.cancel') }}</button></div>
          </form>
        }
        @if (!templates().length) { <p class="hint">{{ t('rx.tpl.empty') }}</p> }
        <ul class="rows">
          @for (x of templates(); track x.id) {
            <li><span class="grow">{{ x.name }}<small> · {{ t('rx.lines', { n: x.items.length }) }}</small></span>
              <button type="button" class="btn" (click)="tpl.set({ ...x })">{{ t('rx.edit') }}</button>
              <button type="button" class="btn" (click)="duplicate(x)">{{ t('rx.tpl.duplicate') }}</button>
              <button type="button" class="btn" (click)="remove(x)">{{ t('rx.tpl.delete') }}</button></li>
          }
        </ul>
      </div>
    </section>
  `,
  styles: `
    :host { display: grid; gap: 16px; }
    .body { padding: 16px; } .hint { color: var(--app-muted); font-size: 13px; margin: 0 0 10px; }
    .logo { display: flex; gap: 16px; align-items: center; } .logo img { max-height: 64px; max-width: 160px; object-fit: contain; border: 1px solid var(--app-line); border-radius: 6px; padding: 4px; }
    .form { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin: 8px 0 16px; padding: 12px; border: 1px solid var(--app-line); border-radius: 8px; }
    .wide { grid-column: 1 / -1; } .field { display: flex; flex-direction: column; gap: 3px; } .label { font-size: 12px; color: var(--app-muted); font-weight: 600; }
    .conds { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; } .check { display: flex; gap: 6px; align-items: center; font-size: 13px; }
    .actions { display: flex; gap: 8px; } .error { color: var(--app-danger); font-size: 13px; margin: 0; }
    .rows { list-style: none; margin: 0; padding: 0; } .rows li { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--app-line); }
    .grow { flex: 1; } .dim { opacity: .55; } small { color: var(--app-muted); }
  `,
})
export class RxSetupComponent {
  private readonly lib = inject(RxLibrary);
  private readonly store = inject(DentalStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly conditions = CONDITIONS;
  protected readonly title = itemTitle;
  protected readonly medFields: { id: MedField; key: Parameters<I18n['t']>[0]; wide?: boolean }[] = [
    { id: 'name', key: 'rx.med.name' }, { id: 'brand', key: 'rx.f.brand' }, { id: 'generic', key: 'rx.f.generic' }, { id: 'strength', key: 'rx.f.strength' },
    { id: 'form', key: 'rx.f.form' }, { id: 'route', key: 'rx.f.route' }, { id: 'aliases', key: 'rx.med.aliases', wide: true }, { id: 'instructions', key: 'rx.f.instructions', wide: true },
  ];
  protected readonly meds = computed(() => [...this.lib.medications()].sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly templates = this.lib.templates;
  protected readonly logo = computed(() => this.store.locations()[0]?.logo);
  protected readonly med = signal<Medication | null>(null);
  protected readonly tpl = signal<RxTemplate | null>(null);
  protected readonly nameMissing = signal(false);
  protected readonly tplInvalid = signal(false);

  protected newMed(): void { this.nameMissing.set(false); this.med.set({ id: crypto.randomUUID(), name: '' }); }
  protected patchMed(f: MedField, v: string): void { this.med.update((m) => (m ? { ...m, [f]: v } : m)); }
  protected toggleCondition(c: string): void {
    this.med.update((m) => { if (!m) return m; const has = (m.reviewConditions ?? []).includes(c); return { ...m, reviewConditions: has ? m.reviewConditions!.filter((x) => x !== c) : [...(m.reviewConditions ?? []), c] }; });
  }
  protected async saveMed(): Promise<void> {
    const m = this.med();
    if (!m) return;
    if (!m.name.trim()) { this.nameMissing.set(true); return; }
    await this.lib.saveMedication({ id: m.id, name: m.name.trim(), brand: text(m.brand), generic: text(m.generic), strength: text(m.strength), form: text(m.form), route: text(m.route), instructions: text(m.instructions), aliases: text(m.aliases), reviewConditions: m.reviewConditions?.length ? m.reviewConditions : undefined, archivedAt: m.archivedAt });
    this.med.set(null);
  }
  protected archive(m: Medication): Promise<void> { return this.lib.saveMedication({ ...m, archivedAt: m.archivedAt ? undefined : new Date().toISOString() }); }

  protected newTpl(): void { this.tplInvalid.set(false); this.tpl.set({ id: crypto.randomUUID(), name: '', items: [], updatedAt: '' }); }
  protected patchTpl(p: Partial<RxTemplate>): void { this.tpl.update((x) => (x ? { ...x, ...p } : x)); }
  protected async saveTpl(): Promise<void> {
    const x = this.tpl();
    if (!x) return;
    if (!x.name.trim() || !x.items.length) { this.tplInvalid.set(true); return; }
    await this.lib.saveTemplate({ ...x, name: x.name.trim(), description: text(x.description), updatedAt: new Date().toISOString() });
    this.tpl.set(null);
  }
  protected duplicate(x: RxTemplate): Promise<void> {
    return this.lib.saveTemplate({ ...x, id: crypto.randomUUID(), name: this.t('rx.tpl.copy', { name: x.name }), items: x.items.map((i) => ({ ...i, id: crypto.randomUUID() })), updatedAt: new Date().toISOString() });
  }
  protected async remove(x: RxTemplate): Promise<void> { if (confirm(this.t('rx.tpl.confirmDelete', { name: x.name }))) await this.lib.removeTemplate(x.id); }

  protected async chooseLogo(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return;
    const k = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    await this.saveLogo(c.toDataURL('image/png'));
  }
  protected async saveLogo(logo: string | undefined): Promise<void> {
    const [first, ...rest] = this.store.locations();
    if (first) await this.store.saveLocations([{ ...first, logo }, ...rest]);
  }
}
