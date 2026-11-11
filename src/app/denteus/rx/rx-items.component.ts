import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { CONDITIONS } from '../patients/patient-rules';
import { RxAlert, RxItem } from '../models/dental.models';
import { displayName, genericOf, norm } from './med-library';
import { RxLibrary } from './rx-library.service';
import { freeItem, itemFromMedication, itemTitle, move } from './rx-rules';

type Field = 'strength' | 'form' | 'route' | 'dosage' | 'frequency' | 'duration' | 'quantity' | 'refills';
const FIELDS: { id: Field; key: Key }[] = [
  { id: 'dosage', key: 'rx.f.dosage' }, { id: 'frequency', key: 'rx.f.frequency' }, { id: 'duration', key: 'rx.f.duration' }, { id: 'route', key: 'rx.f.route' },
  { id: 'quantity', key: 'rx.f.quantity' }, { id: 'refills', key: 'rx.f.refills' }, { id: 'strength', key: 'rx.f.strength' }, { id: 'form', key: 'rx.f.form' },
];
type AlertDraft = { itemId: string; type: RxAlert['type']; refId: string; critical: boolean; message: string };

/** The medication lines of a prescription or a saved prescription: pick from the library or type, edit every field, set alerts, reorder, remove. */
@Component({
  selector: 'den-rx-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="lines">
      @for (i of items(); track i.id; let n = $index; let first = $first; let last = $last) {
        <li class="line">
          <div class="line-head">
            <input class="input name" [value]="i.name" maxlength="120" [attr.aria-label]="t('rx.f.medication')" [placeholder]="t('rx.f.medication')" (input)="set(i.id, 'name', $any($event.target).value)" />
            <button type="button" class="btn btn--icon" [disabled]="first" [attr.aria-label]="t('rx.up')" [title]="t('rx.up')" (click)="shift(n, -1)"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
            <button type="button" class="btn btn--icon" [disabled]="last" [attr.aria-label]="t('rx.down')" [title]="t('rx.down')" (click)="shift(n, 1)"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
            <button type="button" class="btn btn--icon" [attr.aria-label]="t('rx.remove')" [title]="t('rx.remove')" (click)="remove(i.id)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </div>
          @if (i.generic) { <div class="sub">{{ i.generic }}</div> }
          <div class="fields">
            @for (f of fields; track f.id) {
              <label class="field"><span class="label">{{ t(f.key) }}</span><input class="input" [value]="i[f.id] ?? ''" maxlength="60" (input)="set(i.id, f.id, $any($event.target).value)" /></label>
            }
          </div>
          <label class="field"><span class="label">{{ t('rx.f.instructions') }}</span><textarea class="input" rows="2" maxlength="500" [value]="i.instructions ?? ''" (input)="set(i.id, 'instructions', $any($event.target).value)"></textarea></label>
          <label class="field"><span class="label">{{ t('rx.f.internal') }}</span><input class="input" maxlength="500" [value]="i.internalNotes ?? ''" (input)="set(i.id, 'internalNotes', $any($event.target).value)" /></label>
          <details [open]="!!i.alerts?.length">
            <summary>{{ t('rx.alerts') }}@if (i.alerts?.length) { ({{ i.alerts!.length }}) }</summary>
            <ul class="alerts">
              @for (a of i.alerts ?? []; track a.id) {
                <li><span class="chip" [attr.data-tone]="a.severity === 'critical' ? 'danger' : 'neutral'">{{ t(typeKey[a.type]) }}</span> {{ a.label }}@if (a.message) { <span class="muted"> — {{ a.message }}</span> }
                  <button type="button" class="btn btn--icon" [attr.aria-label]="t('rx.remove')" (click)="removeAlert(i.id, a.id)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></li>
              }
            </ul>
            @if (!i.alerts?.length) { <p class="muted">{{ t('rx.alert.none') }}</p> }
            @if (draft(); as d) {
              @if (d.itemId === i.id) {
                <div class="alert-form">
                  <label class="field"><span class="label">{{ t('rx.alert.type') }}</span>
                    <select class="input" (change)="setType($any($event.target).value)">
                      @for (k of types; track k) { <option [value]="k" [selected]="d.type === k">{{ t(typeKey[k]) }}</option> }
                    </select></label>
                  <label class="field"><span class="label">{{ t('rx.alert.target') }}</span>
                    <select class="input" (change)="patchDraft({ refId: $any($event.target).value })">
                      <option value="" [selected]="!d.refId">—</option>
                      @for (o of targets(); track o.id) { <option [value]="o.id" [selected]="d.refId === o.id">{{ o.label }}</option> }
                    </select></label>
                  <label class="field wide"><span class="label">{{ t('rx.alert.message') }}</span><input class="input" maxlength="300" [value]="d.message" (input)="patchDraft({ message: $any($event.target).value })" /></label>
                  <label class="check"><input type="checkbox" [checked]="d.critical" (change)="patchDraft({ critical: $any($event.target).checked })" />{{ t('rx.alert.critical') }}</label>
                  <div class="row"><button type="button" class="btn btn--primary" [disabled]="!d.refId" (click)="addAlert()">{{ t('rx.alert.add') }}</button><button type="button" class="btn" (click)="draft.set(null)">{{ t('lib.cancel') }}</button></div>
                </div>
              }
            }
            @if (draft()?.itemId !== i.id) { <button type="button" class="btn" (click)="openDraft(i.id)"><i class="fa-solid fa-bell" aria-hidden="true"></i>{{ t('rx.alert.add') }}</button> }
          </details>
        </li>
      }
    </ol>
    <div class="add">
      <input class="input" type="search" [value]="query()" [placeholder]="t('rx.search')" [attr.aria-label]="t('rx.search')" maxlength="80" autocomplete="off"
        (input)="query.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); addFirst()" />
      <button type="button" class="btn" (click)="addBlank()"><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ t('rx.add.blank') }}</button>
    </div>
    @if (query().trim()) {
      <ul class="results" role="listbox" [attr.aria-label]="t('rx.fromLibrary')">
        @for (m of matches(); track m.id) {
          <li><button type="button" role="option" class="pick" (click)="addMedication(m.id)">{{ label(m.id) }}</button></li>
        }
        <li><button type="button" class="pick typed" (click)="addTyped()">{{ t('rx.add.typed', { name: query().trim() }) }}</button></li>
        @if (canAdd()) { <li><button type="button" class="pick typed" (click)="addToLibrary()">{{ t('rx.addToLibrary', { name: query().trim() }) }}</button></li> }
      </ul>
    }
  `,
  styles: `
    :host { display: block; }
    .lines { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 12px; }
    .line { border: 1px solid var(--app-line); border-radius: 8px; padding: 12px; display: grid; gap: 10px; }
    .line-head { display: flex; gap: 6px; } .name { flex: 1; font-weight: 600; } .sub, .muted { color: var(--app-muted); font-size: 13px; margin: 0; }
    .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .field { display: flex; flex-direction: column; gap: 3px; } .label { font-size: 12px; color: var(--app-muted); font-weight: 600; } .wide { grid-column: 1 / -1; }
    summary { cursor: pointer; font-size: 13px; color: var(--app-muted); }
    .alerts { list-style: none; margin: 6px 0; padding: 0; display: grid; gap: 4px; } .alerts li { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 13px; }
    .alert-form { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-top: 8px; } .check { display: flex; gap: 6px; align-items: center; font-size: 13px; } .row { display: flex; gap: 8px; }
    .add { display: flex; gap: 8px; flex-wrap: wrap; } .add .input { flex: 1 1 260px; }
    .results { list-style: none; margin: 6px 0 0; padding: 4px; border: 1px solid var(--app-line); border-radius: 8px; max-height: 260px; overflow: auto; }
    .pick { all: unset; display: block; width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
    .pick:hover, .pick:focus-visible { background: var(--app-hover, rgba(127,127,127,.12)); outline: none; } .typed { font-style: italic; }
  `,
})
export class RxItemsComponent {
  readonly items = input.required<RxItem[]>();
  readonly itemsChange = output<RxItem[]>();
  private readonly lib = inject(RxLibrary);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly fields = FIELDS;
  protected readonly title = itemTitle;
  protected readonly types = ['allergy', 'medication', 'problem'] as const;
  protected readonly typeKey: Record<RxAlert['type'], Key> = { allergy: 'rx.alert.allergy', medication: 'rx.alert.medication', problem: 'rx.alert.problem' };
  protected readonly query = signal('');
  protected readonly draft = signal<AlertDraft | null>(null);
  protected readonly matches = computed(() => {
    const q = norm(this.query());
    const meds = this.lib.medications();
    return q ? meds.filter((m) => !m.hidden && (norm(m.name).includes(q) || norm(genericOf(meds, m.id)?.name ?? '').includes(q))).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 10) : [];
  });
  protected readonly canAdd = computed(() => this.lib.canEdit && !!this.query().trim() && !this.lib.medications().some((m) => m.kind === 'generic' && norm(m.name) === norm(this.query())));
  protected readonly targets = computed((): { id: string; label: string }[] => {
    const d = this.draft();
    if (!d) return [];
    const meds = this.lib.medications();
    if (d.type === 'allergy') return this.lib.allergies().filter((a) => !a.hidden).map((a) => ({ id: a.id, label: a.name })).sort((a, b) => a.label.localeCompare(b.label));
    if (d.type === 'medication') return meds.filter((m) => !m.hidden).map((m) => ({ id: m.id, label: displayName(meds, m) })).sort((a, b) => a.label.localeCompare(b.label));
    return CONDITIONS.map((c) => ({ id: c, label: this.t(`med.${c}` as Key) }));
  });
  private readonly id = () => crypto.randomUUID();

  protected label(id: string): string { const m = this.lib.medications().find((x) => x.id === id); return m ? displayName(this.lib.medications(), m) : ''; }
  protected set(id: string, field: keyof RxItem, value: string): void { this.itemsChange.emit(this.items().map((i) => (i.id === id ? { ...i, [field]: value } : i))); }
  protected remove(id: string): void { this.itemsChange.emit(this.items().filter((i) => i.id !== id)); }
  protected shift(n: number, by: number): void { this.itemsChange.emit(move(this.items(), n, n + by)); }
  protected addBlank(): void { this.itemsChange.emit([...this.items(), freeItem(this.id())]); }
  protected addTyped(): void { this.itemsChange.emit([...this.items(), freeItem(this.id(), this.query().trim())]); this.query.set(''); }
  protected addMedication(id: string): void {
    const m = this.lib.medications().find((x) => x.id === id);
    if (m) this.itemsChange.emit([...this.items(), itemFromMedication(m, this.lib.medications(), this.id())]);
    this.query.set('');
  }
  protected async addToLibrary(): Promise<void> {
    const name = this.query().trim();
    const m = { id: this.id(), kind: 'generic' as const, name };
    if (await this.lib.saveMedication(m)) return;
    this.addMedication(m.id);
  }
  protected addFirst(): void { const m = this.matches()[0]; if (m) this.addMedication(m.id); else if (this.query().trim()) this.addTyped(); }

  protected openDraft(itemId: string): void { this.draft.set({ itemId, type: 'allergy', refId: '', critical: false, message: '' }); }
  protected patchDraft(p: Partial<AlertDraft>): void { this.draft.update((d) => (d ? { ...d, ...p } : d)); }
  protected setType(type: RxAlert['type']): void { this.patchDraft({ type, refId: '' }); }
  protected addAlert(): void {
    const d = this.draft();
    const target = this.targets().find((x) => x.id === d?.refId);
    if (!d || !target) return;
    const alert: RxAlert = { id: this.id(), type: d.type, refId: target.id, label: target.label, severity: d.critical ? 'critical' : 'warning', ...(d.message.trim() ? { message: d.message.trim() } : {}) };
    this.itemsChange.emit(this.items().map((i) => (i.id === d.itemId ? { ...i, alerts: [...(i.alerts ?? []), alert] } : i)));
    this.draft.set(null);
  }
  protected removeAlert(itemId: string, alertId: string): void {
    this.itemsChange.emit(this.items().map((i) => (i.id === itemId ? { ...i, alerts: (i.alerts ?? []).filter((a) => a.id !== alertId) } : i)));
  }
}
