import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { RxItem } from '../models/dental.models';
import { RxLibrary } from './rx-library.service';
import { freeItem, itemFromMedication, itemTitle, move } from './rx-rules';

type Field = 'strength' | 'form' | 'route' | 'dosage' | 'frequency' | 'duration' | 'quantity' | 'refills';
const FIELDS: { id: Field; key: Key }[] = [
  { id: 'strength', key: 'rx.f.strength' }, { id: 'form', key: 'rx.f.form' }, { id: 'route', key: 'rx.f.route' }, { id: 'dosage', key: 'rx.f.dosage' },
  { id: 'frequency', key: 'rx.f.frequency' }, { id: 'duration', key: 'rx.f.duration' }, { id: 'quantity', key: 'rx.f.quantity' }, { id: 'refills', key: 'rx.f.refills' },
];

/** The medication lines of a prescription or a saved prescription: search or type to add, edit every field, reorder, remove. */
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
          <div class="fields">
            @for (f of fields; track f.id) {
              <label class="field"><span class="label">{{ t(f.key) }}</span><input class="input" [value]="i[f.id] ?? ''" maxlength="60" (input)="set(i.id, f.id, $any($event.target).value)" /></label>
            }
          </div>
          <label class="field"><span class="label">{{ t('rx.f.instructions') }}</span><textarea class="input" rows="2" maxlength="500" [value]="i.instructions ?? ''" (input)="set(i.id, 'instructions', $any($event.target).value)"></textarea></label>
          <details>
            <summary>{{ t('rx.more') }}</summary>
            <div class="fields">
              <label class="field"><span class="label">{{ t('rx.f.brand') }}</span><input class="input" [value]="i.brand ?? ''" maxlength="80" (input)="set(i.id, 'brand', $any($event.target).value)" /></label>
              <label class="field"><span class="label">{{ t('rx.f.generic') }}</span><input class="input" [value]="i.generic ?? ''" maxlength="80" (input)="set(i.id, 'generic', $any($event.target).value)" /></label>
              <label class="field"><span class="label">{{ t('rx.med.aliases') }}</span><input class="input" [value]="i.aliases ?? ''" maxlength="120" (input)="set(i.id, 'aliases', $any($event.target).value)" /></label>
            </div>
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
      <ul class="results" role="listbox" [attr.aria-label]="t('rx.f.medication')">
        @for (m of matches(); track m.id) {
          <li><button type="button" role="option" class="pick" (click)="addMedication(m.id)">{{ title(m) }}</button></li>
        }
        <li><button type="button" class="pick typed" (click)="addTyped()">{{ t('rx.add.typed', { name: query().trim() }) }}</button></li>
      </ul>
    }
  `,
  styles: `
    :host { display: block; }
    .lines { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 12px; }
    .line { border: 1px solid var(--app-line); border-radius: 8px; padding: 12px; display: grid; gap: 10px; }
    .line-head { display: flex; gap: 6px; } .name { flex: 1; font-weight: 600; }
    .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 4px; }
    .field { display: flex; flex-direction: column; gap: 3px; } .label { font-size: 12px; color: var(--app-muted); font-weight: 600; }
    summary { cursor: pointer; font-size: 13px; color: var(--app-muted); }
    .add { display: flex; gap: 8px; flex-wrap: wrap; } .add .input { flex: 1 1 260px; }
    .results { list-style: none; margin: 6px 0 0; padding: 4px; border: 1px solid var(--app-line); border-radius: 8px; max-height: 240px; overflow: auto; }
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
  protected readonly query = signal('');
  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.lib.medications().filter((m) => !m.archivedAt && [m.name, m.brand, m.generic].some((x) => x?.toLowerCase().includes(q))).slice(0, 8) : [];
  });
  private readonly id = () => crypto.randomUUID();

  protected set(id: string, field: keyof RxItem, value: string): void { this.itemsChange.emit(this.items().map((i) => (i.id === id ? { ...i, [field]: value } : i))); }
  protected remove(id: string): void { this.itemsChange.emit(this.items().filter((i) => i.id !== id)); }
  protected shift(n: number, by: number): void { this.itemsChange.emit(move(this.items(), n, n + by)); }
  protected addBlank(): void { this.itemsChange.emit([...this.items(), freeItem(this.id())]); }
  protected addTyped(): void { this.itemsChange.emit([...this.items(), freeItem(this.id(), this.query().trim())]); this.query.set(''); }
  protected addMedication(id: string): void {
    const m = this.lib.medications().find((x) => x.id === id);
    if (m) this.itemsChange.emit([...this.items(), itemFromMedication(m, this.id())]);
    this.query.set('');
  }
  protected addFirst(): void { const m = this.matches()[0]; if (m) this.addMedication(m.id); else if (this.query().trim()) this.addTyped(); }
}
