import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { AllergyDef } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { displayName, norm } from './med-library';
import { RxLibrary } from './rx-library.service';

/** Setup > Allergies: the clinic's allergy master list. Hide, delete when unused, merge duplicates. */
@Component({
  selector: 'den-allergy-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="al-title">
      <header class="card-head"><h2 class="card-title" id="al-title"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>{{ t('set.allergies') }}</h2>
        @if (lib.canEdit) { <button type="button" class="btn" (click)="add()"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('lib.alg.add') }}</button> }</header>
      <div class="body">
        <p class="hint">{{ t('lib.alg.intro') }}</p>
        <div class="row tools">
          <input class="input grow" type="search" [value]="query()" [placeholder]="t('lib.search')" [attr.aria-label]="t('lib.search')" maxlength="80" (input)="query.set($any($event.target).value)" />
          <label class="check"><input type="checkbox" [checked]="showHidden()" (change)="showHidden.set($any($event.target).checked)" />{{ t('lib.showHidden') }}</label>
        </div>

        @if (edit(); as a) {
          <form class="form" novalidate (submit)="$event.preventDefault(); save()">
            <label class="field"><span class="label">{{ t('lib.alg.name') }}</span><input class="input" [value]="a.name" maxlength="120" (input)="patch({ name: $any($event.target).value })" [attr.aria-invalid]="error() ? 'true' : null" /></label>
            <label class="field"><span class="label">{{ t('lib.alg.med') }}</span>
              <select class="input" (change)="patch({ medicationId: $any($event.target).value || undefined })">
                <option value="" [selected]="!a.medicationId">{{ t('lib.alg.none') }}</option>
                @for (m of meds(); track m.id) { <option [value]="m.id" [selected]="a.medicationId === m.id">{{ m.label }}</option> }
              </select></label>
            <label class="field"><span class="label">{{ t('lib.externalId') }}</span><input class="input" [value]="a.externalId ?? ''" maxlength="80" (input)="patch({ externalId: $any($event.target).value })" /></label>
            <label class="check"><input type="checkbox" [checked]="!!a.hidden" (change)="patch({ hidden: $any($event.target).checked })" />{{ t('lib.hidden') }}</label>
            @if (error()) { <p class="error wide" role="alert">{{ t(error() === 'name' ? 'lib.err.name' : 'lib.err.duplicate') }}</p> }
            <div class="wide row"><button class="btn btn--primary" type="submit">{{ t('lib.save') }}</button><button class="btn" type="button" (click)="edit.set(null)">{{ t('lib.cancel') }}</button></div>
          </form>
        }

        <div class="grid" role="table" [attr.aria-label]="t('set.allergies')">
          <div class="head" role="row"><span role="columnheader">{{ t('lib.alg.name') }}</span><span role="columnheader">{{ t('lib.alg.med') }}</span><span role="columnheader">{{ t('lib.col.inUse') }}</span><span></span></div>
          @for (r of rows(); track r.a.id) {
            <div class="rowline" role="row" [class.dim]="r.a.hidden">
              <span role="cell">{{ r.a.name }}@if (r.a.hidden) { <span class="chip">{{ t('lib.hidden') }}</span> }</span>
              <span role="cell">{{ r.med }}</span>
              <span role="cell">@if (r.patients || r.templates) { <span class="chip" data-tone="info">{{ t('lib.alg.patients', { n: r.patients }) }}@if (r.templates) { , {{ t('lib.alg.templates', { n: r.templates }) }} }</span> } @else { <span class="chip">{{ t('lib.unused') }}</span> }</span>
              <span role="cell" class="acts">
                @if (lib.canEdit) {
                  <button type="button" class="btn" (click)="editExisting(r.a)">{{ t('lib.edit') }}</button>
                  <button type="button" class="btn" (click)="startMerge(r.a)">{{ t('lib.alg.merge') }}</button>
                  <button type="button" class="btn" [disabled]="r.patients + r.templates > 0" [title]="r.patients + r.templates > 0 ? t('lib.blocked') : ''" (click)="remove(r.a)">{{ t('lib.delete') }}</button>
                }
              </span>
            </div>
          }
          @if (!rows().length) { <p class="hint pad">{{ t('lib.empty') }}</p> }
        </div>

        @if (merge(); as m) {
          <section class="detail" role="alertdialog" aria-labelledby="mg-title">
            <h3 id="mg-title">{{ t('lib.alg.merge') }} “{{ m.from.name }}”</h3>
            <label class="field"><span class="label">{{ t('lib.alg.mergeInto') }}</span>
              <select class="input" (change)="mergeTo.set($any($event.target).value)">
                <option value="" [selected]="!mergeTo()">—</option>
                @for (o of mergeTargets(); track o.id) { <option [value]="o.id" [selected]="mergeTo() === o.id">{{ o.name }}</option> }
              </select></label>
            @if (target(); as to) {
              <p class="warn">{{ t('lib.alg.mergeWarn', { from: m.from.name, to: to.name }) }}</p>
              <div class="row"><button type="button" class="btn btn--primary" (click)="confirmMerge()">{{ t('lib.alg.mergeGo', { n: m.count }) }}</button><button type="button" class="btn" (click)="merge.set(null)">{{ t('lib.cancel') }}</button></div>
            } @else { <div class="row"><button type="button" class="btn" (click)="merge.set(null)">{{ t('lib.cancel') }}</button></div> }
          </section>
        }
        @if (note()) { <p class="hint" role="status">{{ note() }}</p> }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; } .body { padding: 16px; } .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .grow { flex: 1 1 240px; } .tools { margin: 8px 0 12px; }
    .hint { color: var(--app-muted); font-size: 13px; margin: 0 0 8px; } .pad { padding: 12px; } .check { display: flex; gap: 6px; align-items: center; font-size: 13px; }
    .form { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin: 8px 0 16px; padding: 12px; border: 1px solid var(--app-line); border-radius: 8px; }
    .wide { grid-column: 1 / -1; } .field { display: flex; flex-direction: column; gap: 3px; } .label { font-size: 12px; color: var(--app-muted); font-weight: 600; } .error { color: var(--app-danger); font-size: 13px; margin: 0; }
    .grid { border: 1px solid var(--app-line); border-radius: 8px; overflow: hidden; }
    .head, .rowline { display: grid; grid-template-columns: minmax(160px, 2fr) minmax(140px, 1.5fr) minmax(140px, 1.5fr) auto; gap: 8px; padding: 8px 12px; align-items: center; }
    .head { font-size: 12px; font-weight: 600; color: var(--app-muted); border-bottom: 1px solid var(--app-line); } .rowline { border-top: 1px solid var(--app-line); } .rowline:first-of-type { border-top: 0; }
    .dim { opacity: .6; } .acts { display: flex; gap: 6px; justify-content: flex-end; }
    .detail { margin-top: 16px; padding: 12px; border: 2px solid currentColor; border-radius: 8px; display: grid; gap: 10px; } .detail h3 { margin: 0; font-size: 15px; } .warn { margin: 0; font-weight: 600; }
  `,
})
export class AllergyLibraryComponent {
  protected readonly lib = inject(RxLibrary);
  private readonly store = inject(DentalStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly query = signal('');
  protected readonly showHidden = signal(false);
  protected readonly edit = signal<AllergyDef | null>(null);
  protected readonly error = signal<'name' | 'duplicate' | null>(null);
  protected readonly merge = signal<{ from: AllergyDef; count: number } | null>(null);
  protected readonly mergeTo = signal('');
  protected readonly note = signal('');

  protected readonly meds = computed(() => this.lib.medications().filter((m) => !m.hidden).map((m) => ({ id: m.id, label: displayName(this.lib.medications(), m) })).sort((a, b) => a.label.localeCompare(b.label)));
  protected readonly rows = computed(() => {
    const q = norm(this.query());
    const all = this.lib.medications();
    return this.lib.allergies().filter((a) => (this.showHidden() || !a.hidden) && (!q || norm(a.name).includes(q))).sort((a, b) => a.name.localeCompare(b.name)).map((a) => {
      const d = this.lib.allergyDeps(a.id);
      const m = all.find((x) => x.id === a.medicationId);
      return { a, med: m ? displayName(all, m) : '', patients: d.patients.length, templates: d.templates.length };
    });
  });
  protected readonly mergeTargets = computed(() => this.lib.allergies().filter((a) => a.id !== this.merge()?.from.id).sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly target = computed(() => this.lib.allergies().find((a) => a.id === this.mergeTo()));

  protected add(): void { this.error.set(null); this.edit.set({ id: crypto.randomUUID(), name: '' }); }
  protected editExisting(a: AllergyDef): void { this.error.set(null); this.edit.set({ ...a }); }
  protected patch(p: Partial<AllergyDef>): void { this.edit.update((a) => (a ? { ...a, ...p } : a)); }
  protected async save(): Promise<void> {
    const a = this.edit();
    if (!a) return;
    const problem = await this.lib.saveAllergy(a);
    this.error.set(problem);
    if (!problem) this.edit.set(null);
  }
  protected async remove(a: AllergyDef): Promise<void> { if (confirm(this.t('lib.confirmDelete', { name: a.name }))) await this.lib.deleteAllergy(a.id); }
  protected startMerge(a: AllergyDef): void { this.mergeTo.set(''); this.note.set(''); this.merge.set({ from: a, count: this.lib.allergyDeps(a.id).patients.length }); }
  protected async confirmMerge(): Promise<void> {
    const m = this.merge();
    if (!m || !this.mergeTo()) return;
    const moved = await this.lib.mergeAllergy(m.from.id, this.mergeTo());
    this.merge.set(null);
    this.note.set(this.t('lib.alg.merged', { n: moved }));
  }
}
