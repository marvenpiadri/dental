import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { LibMedication } from '../models/dental.models';
import { CONDITIONS } from '../patients/patient-rules';
import { DentalStore } from '../services/dental-store.service';
import { MedProblem, displayName, genericOf, medDeleteBlocks, norm } from './med-library';
import { RxLibrary } from './rx-library.service';

/** Setup > Medications: the clinic's master list of generics and the brands that belong to them. Search, add, edit, inspect, hide, delete when unused. */
@Component({
  selector: 'den-med-library',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="ml-title">
      <header class="card-head"><h2 class="card-title" id="ml-title"><i class="fa-solid fa-pills" aria-hidden="true"></i>{{ t('set.medications') }}</h2>
        @if (lib.canEdit) {
          <div class="row"><button type="button" class="btn" (click)="add('generic')"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('lib.med.addGeneric') }}</button>
            <button type="button" class="btn" [disabled]="!generics().length" (click)="add('brand')"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('lib.med.addBrand') }}</button></div>
        }
      </header>
      <div class="body">
        <p class="hint">{{ t('lib.med.intro') }}</p>
        <div class="row tools">
          <input class="input grow" type="search" [value]="query()" [placeholder]="t('lib.search')" [attr.aria-label]="t('lib.search')" maxlength="80" (input)="query.set($any($event.target).value)" />
          <label class="check"><input type="checkbox" [checked]="showHidden()" (change)="showHidden.set($any($event.target).checked)" />{{ t('lib.showHidden') }}</label>
        </div>

        @if (edit(); as m) {
          <form class="form" novalidate (submit)="$event.preventDefault(); save()">
            <label class="field"><span class="label">{{ t(m.kind === 'brand' ? 'lib.med.brandName' : 'lib.med.name') }}</span>
              <input class="input" [value]="m.name" maxlength="120" (input)="patch({ name: $any($event.target).value })" [attr.aria-invalid]="error() === 'name' || error() === 'duplicate' ? 'true' : null" /></label>
            @if (m.kind === 'brand') {
              <label class="field"><span class="label">{{ t('lib.med.genericOf') }}</span>
                <select class="input" (change)="patch({ genericId: $any($event.target).value })" [attr.aria-invalid]="error() === 'generic' ? 'true' : null">
                  <option value="" [selected]="!m.genericId">—</option>
                  @for (g of generics(); track g.id) { <option [value]="g.id" [selected]="m.genericId === g.id">{{ g.name }}</option> }
                </select></label>
            } @else {
              <label class="field wide"><span class="label">{{ t('lib.med.notes') }}</span>
                <textarea class="input" rows="3" maxlength="4000" [value]="m.notes ?? ''" (input)="patch({ notes: $any($event.target).value })"></textarea>
                <span class="hint">{{ t('lib.med.notes.hint') }}</span></label>
              <fieldset class="wide conds"><legend class="label">{{ t('rx.med.review') }}</legend>
                @for (c of conditions; track c) { <label class="check"><input type="checkbox" [checked]="(m.reviewConditions ?? []).includes(c)" (change)="toggle(c)" />{{ t($any('med.' + c)) }}</label> }
              </fieldset>
            }
            <label class="field"><span class="label">{{ t('lib.externalId') }}</span><input class="input" [value]="m.externalId ?? ''" maxlength="80" (input)="patch({ externalId: $any($event.target).value })" /></label>
            @if (error()) { <p class="error wide" role="alert">{{ t(errKey[error()!]) }}</p> }
            <div class="wide row"><button class="btn btn--primary" type="submit">{{ t('lib.save') }}</button><button class="btn" type="button" (click)="edit.set(null)">{{ t('lib.cancel') }}</button></div>
          </form>
        }

        <div class="grid" role="table" [attr.aria-label]="t('set.medications')">
          <div class="head" role="row"><span role="columnheader">{{ t('lib.col.name') }}</span><span role="columnheader">{{ t('lib.col.type') }}</span><span role="columnheader">{{ t('lib.col.generic') }}</span><span role="columnheader">{{ t('lib.col.inUse') }}</span><span></span></div>
          @for (m of rows(); track m.id) {
            <div class="rowline" role="row" [class.dim]="m.hidden" [class.sel]="selected() === m.id">
              <span role="cell"><button type="button" class="link" (click)="select(m.id)">{{ m.name }}</button>@if (m.hidden) { <span class="chip">{{ t('lib.hidden') }}</span> }</span>
              <span role="cell">{{ t(m.kind === 'brand' ? 'lib.brand' : 'lib.generic') }}</span>
              <span role="cell">{{ m.kind === 'brand' ? genericName(m) : '' }}</span>
              <span role="cell"><span class="chip" [attr.data-tone]="inUse(m.id) ? 'info' : 'neutral'">{{ t(inUse(m.id) ? 'lib.inUse' : 'lib.unused') }}</span></span>
              <span role="cell" class="acts">@if (lib.canEdit) { <button type="button" class="btn" (click)="editExisting(m)">{{ t('lib.edit') }}</button> }</span>
            </div>
          }
          @if (!rows().length) { <p class="hint pad">{{ t('lib.empty') }}</p> }
        </div>

        @if (detail(); as d) {
          <section class="detail" aria-live="polite">
            <h3>{{ d.title }}</h3>
            @if (d.med.kind === 'generic' && d.med.notes) { <p class="notes">{{ d.med.notes }}</p> }
            @if (d.med.kind === 'brand') { <p class="hint">{{ t('lib.col.generic') }}: <button type="button" class="link" (click)="select(d.med.genericId!)">{{ genericName(d.med) }}</button></p> }
            <h4>{{ t('lib.deps') }}</h4>
            @if (d.empty) { <p class="hint">{{ t('lib.deps.none') }}</p> }
            @if (d.deps.brands.length) { <p><strong>{{ t('lib.deps.brands') }}:</strong> @for (b of d.deps.brands; track b.id) { <button type="button" class="link" (click)="select(b.id)">{{ b.name }}</button> } </p> }
            @if (d.deps.patientsTaking.length) { <p><strong>{{ t('lib.deps.taking') }}:</strong> @for (p of d.deps.patientsTaking; track p.id) { <a class="link" [routerLink]="['/patients', p.id]">{{ p.name }}</a> } </p> }
            @if (d.deps.patientsAllergic.length) { <p><strong>{{ t('lib.deps.allergic') }}:</strong> @for (p of d.deps.patientsAllergic; track p.id) { <a class="link" [routerLink]="['/patients', p.id]">{{ p.name }}</a> } </p> }
            @if (d.deps.allergyDefs.length) { <p><strong>{{ t('lib.deps.allergies') }}:</strong> {{ names(d.deps.allergyDefs) }}</p> }
            @if (d.deps.templates.length) { <p><strong>{{ t('lib.deps.templates') }}:</strong> {{ names(d.deps.templates) }}</p> }
            @if (lib.canEdit) {
              <div class="row">
                <button type="button" class="btn" (click)="toggleHidden(d.med)">{{ t(d.med.hidden ? 'lib.unhide' : 'lib.hide') }}</button>
                <button type="button" class="btn" [disabled]="d.blocks.length > 0" (click)="remove(d.med)">{{ t('lib.delete') }}</button>
              </div>
              @if (d.blocks.length) { <p class="hint">{{ t('lib.blocked') }}</p> }
            }
          </section>
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; } .body { padding: 16px; } .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .grow { flex: 1 1 240px; } .tools { margin: 8px 0 12px; }
    .hint { color: var(--app-muted); font-size: 13px; margin: 0 0 8px; } .pad { padding: 12px; } .check { display: flex; gap: 6px; align-items: center; font-size: 13px; }
    .form { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin: 8px 0 16px; padding: 12px; border: 1px solid var(--app-line); border-radius: 8px; }
    .wide { grid-column: 1 / -1; } .field { display: flex; flex-direction: column; gap: 3px; } .label { font-size: 12px; color: var(--app-muted); font-weight: 600; }
    .conds { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; } .error { color: var(--app-danger); font-size: 13px; margin: 0; }
    .grid { border: 1px solid var(--app-line); border-radius: 8px; overflow: hidden; }
    .head, .rowline { display: grid; grid-template-columns: minmax(160px, 2fr) 100px minmax(120px, 1.5fr) 100px 80px; gap: 8px; padding: 8px 12px; align-items: center; }
    .head { font-size: 12px; font-weight: 600; color: var(--app-muted); border-bottom: 1px solid var(--app-line); } .rowline { border-top: 1px solid var(--app-line); } .rowline:first-of-type { border-top: 0; }
    .rowline.sel { background: var(--app-hover, rgba(127,127,127,.1)); } .dim { opacity: .6; } .acts { text-align: right; }
    .link { all: unset; cursor: pointer; text-decoration: underline; margin-right: 8px; } .link:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .detail { margin-top: 16px; padding: 12px; border: 1px solid var(--app-line); border-radius: 8px; } .detail h3 { margin: 0 0 6px; font-size: 15px; } .detail h4 { margin: 12px 0 4px; font-size: 13px; } .notes { white-space: pre-wrap; }
  `,
})
export class MedicationLibraryComponent {
  protected readonly lib = inject(RxLibrary);
  private readonly store = inject(DentalStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly conditions = CONDITIONS;
  protected readonly errKey: Record<MedProblem, Key> = { name: 'lib.err.name', generic: 'lib.err.generic', duplicate: 'lib.err.duplicate' };
  protected readonly query = signal('');
  protected readonly showHidden = signal(false);
  protected readonly edit = signal<LibMedication | null>(null);
  protected readonly error = signal<MedProblem | null>(null);
  protected readonly selected = signal<string | null>(null);

  protected readonly generics = computed(() => this.lib.medications().filter((m) => m.kind === 'generic' && !m.hidden).sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly rows = computed(() => {
    const q = norm(this.query());
    const meds = this.lib.medications();
    return meds.filter((m) => (this.showHidden() || !m.hidden) && (!q || norm(m.name).includes(q) || norm(genericOf(meds, m.id)?.name ?? '').includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  });
  private readonly use = computed(() => {
    const used = new Set<string>();
    for (const p of this.store.patients()) for (const x of p.patientMedications ?? []) if (!x.removedAt) used.add(x.medicationId);
    for (const t of this.lib.templates()) for (const i of t.items) if (i.medicationId) used.add(i.medicationId);
    for (const a of this.lib.allergies()) if (a.medicationId) used.add(a.medicationId);
    for (const m of this.lib.medications()) if (m.genericId) used.add(m.genericId);
    return used;
  });
  protected inUse(id: string): boolean { return this.use().has(id); }
  protected readonly detail = computed(() => {
    const med = this.lib.medications().find((m) => m.id === this.selected());
    if (!med) return null;
    const deps = this.lib.medicationDeps(med.id);
    return { med, deps, title: displayName(this.lib.medications(), med), blocks: medDeleteBlocks(deps), empty: !deps.brands.length && !deps.patientsTaking.length && !deps.patientsAllergic.length && !deps.allergyDefs.length && !deps.templates.length };
  });

  protected genericName(m: LibMedication): string { return genericOf(this.lib.medications(), m.id)?.name ?? ''; }
  protected names(list: { name: string }[]): string { return list.map((x) => x.name).join(', '); }
  protected select(id: string): void { this.selected.set(id); }
  protected add(kind: LibMedication['kind']): void { this.error.set(null); this.edit.set({ id: crypto.randomUUID(), kind, name: '', ...(kind === 'brand' ? { genericId: this.selected() && this.generics().some((g) => g.id === this.selected()) ? this.selected()! : '' } : {}) }); }
  protected editExisting(m: LibMedication): void { this.error.set(null); this.edit.set({ ...m }); }
  protected patch(p: Partial<LibMedication>): void { this.edit.update((m) => (m ? { ...m, ...p } : m)); }
  protected toggle(c: string): void { this.edit.update((m) => { if (!m) return m; const has = (m.reviewConditions ?? []).includes(c); return { ...m, reviewConditions: has ? m.reviewConditions!.filter((x) => x !== c) : [...(m.reviewConditions ?? []), c] }; }); }
  protected async save(): Promise<void> {
    const m = this.edit();
    if (!m) return;
    const problem = await this.lib.saveMedication(m);
    this.error.set(problem);
    if (!problem) { this.selected.set(m.id); this.edit.set(null); }
  }
  protected toggleHidden(m: LibMedication): Promise<unknown> { return this.lib.saveMedication({ ...m, hidden: !m.hidden }); }
  protected async remove(m: LibMedication): Promise<void> {
    if (!confirm(this.t('lib.confirmDelete', { name: m.name }))) return;
    if (!(await this.lib.deleteMedication(m.id)).length) this.selected.set(null);
  }
}
