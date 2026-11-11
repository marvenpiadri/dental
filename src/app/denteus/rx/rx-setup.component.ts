import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { RxTemplate } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { LibraryShareComponent } from './library-share.component';
import { RxItemsComponent } from './rx-items.component';
import { RxLibrary } from './rx-library.service';
import { norm } from './med-library';

const text = (v: string | undefined): string | undefined => (v?.trim() ? v.trim() : undefined);

/** Setup > Prescribing: the clinic's medication list, its saved prescriptions and the logo printed on prescriptions. */
@Component({
  selector: 'den-rx-setup',
  imports: [RxItemsComponent, LibraryShareComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="rx-logo">
      <header class="card-head"><h2 class="card-title" id="rx-logo"><i class="fa-solid fa-image" aria-hidden="true"></i>{{ t('rx.logo.title') }}</h2></header>
      <div class="body logo">
        @if (logo(); as l) { <img [src]="l" alt="" /> }
        <div>
          <p class="hint">{{ t('rx.logo.hint') }}</p>
          @if (canLogo()) { <label class="btn"><i class="fa-solid fa-upload" aria-hidden="true"></i>{{ t('rx.logo.choose') }}<input type="file" accept="image/png,image/jpeg" hidden (change)="chooseLogo($event)" /></label>
          @if (logo()) { <button type="button" class="btn" (click)="saveLogo(undefined)">{{ t('rx.logo.remove') }}</button> } }
        </div>
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
        <input class="input search" type="search" [value]="query()" [placeholder]="t('rx.tpl.search')" [attr.aria-label]="t('rx.tpl.search')" maxlength="80" (input)="query.set($any($event.target).value)" />
        @if (!shown().length) { <p class="hint">{{ t('rx.tpl.empty') }}</p> }
        <ul class="rows">
          @for (x of shown(); track x.id) {
            <li><span class="grow">{{ x.name }}<small> · {{ t('rx.lines', { n: x.items.length }) }}</small></span>
              <button type="button" class="btn" (click)="tpl.set({ ...x })">{{ t('rx.edit') }}</button>
              <button type="button" class="btn" (click)="duplicate(x)">{{ t('rx.tpl.duplicate') }}</button>
              <button type="button" class="btn" (click)="remove(x)">{{ t('rx.tpl.delete') }}</button></li>
          }
        </ul>
      </div>
    </section>

    <den-library-share />
  `,
  styles: `
    :host { display: grid; gap: 16px; }
    .body { padding: 16px; } .hint { color: var(--app-muted); font-size: 13px; margin: 0 0 10px; }
    .logo { display: flex; gap: 16px; align-items: center; } .logo img { max-height: 64px; max-width: 160px; object-fit: contain; border: 1px solid var(--app-line); border-radius: 6px; padding: 4px; }
    .form { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin: 8px 0 16px; padding: 12px; border: 1px solid var(--app-line); border-radius: 8px; }
    .wide { grid-column: 1 / -1; } .field { display: flex; flex-direction: column; gap: 3px; } .label { font-size: 12px; color: var(--app-muted); font-weight: 600; }
    .conds { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; } .check { display: flex; gap: 6px; align-items: center; font-size: 13px; }
    .search { margin-bottom: 8px; max-width: 360px; } .actions { display: flex; gap: 8px; } .error { color: var(--app-danger); font-size: 13px; margin: 0; }
    .rows { list-style: none; margin: 0; padding: 0; } .rows li { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--app-line); }
    .grow { flex: 1; } .dim { opacity: .55; } small { color: var(--app-muted); }
  `,
})
export class RxSetupComponent {
  private readonly lib = inject(RxLibrary);
  private readonly store = inject(DentalStore);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly templates = this.lib.templates;
  protected readonly canLogo = computed(() => this.auth.can('settings.edit'));
  protected readonly logo = computed(() => this.store.locations()[0]?.logo);
  protected readonly query = signal('');
  protected readonly shown = computed(() => { const q = norm(this.query()); return this.lib.templates().filter((x) => !q || norm(x.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name)); });
  protected readonly tpl = signal<RxTemplate | null>(null);
  protected readonly tplInvalid = signal(false);

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
