import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { GeoService } from './geo.service';
import { countryName, countryOf, fold, searchCountries, searchPlaces } from './regional-rules';

interface Option { value: string; label: string; custom?: boolean }
let nextId = 0;

/**
 * A searchable combobox for a country (picked from the list, stored as its ISO code) or a city (suggested from that country's
 * file, but any text can be kept: neighbourhoods and small towns are not in the data).
 */
@Component({
  selector: 'den-place-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="field">
      <span class="label">{{ label() }}</span>
      <input class="input" type="text" role="combobox" autocomplete="off" spellcheck="false" maxlength="80"
        [attr.aria-expanded]="open()" [attr.aria-controls]="listId" aria-autocomplete="list" [attr.aria-activedescendant]="open() && options().length ? listId + '-' + active() : null"
        [value]="text()" [disabled]="disabled()" [attr.placeholder]="placeholder()"
        (input)="type($any($event.target).value)" (focus)="open.set(true)" (blur)="commit()" (keydown)="key($event)" />
    </label>
    @if (open() && options().length) {
      <ul class="list" role="listbox" [id]="listId">
        @for (o of options(); track o.value + o.label; let i = $index) {
          <li role="option" [id]="listId + '-' + i" [attr.aria-selected]="i === active()" [class.on]="i === active()" [class.custom]="o.custom" (mousedown)="$event.preventDefault(); pick(o)">{{ o.label }}</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { position: relative; display: block; min-width: 0; }
    .field { display: flex; flex-direction: column; gap: 4px; } .label { font-size: 13px; font-weight: 600; color: var(--app-muted); }
    .input { width: 100%; box-sizing: border-box; min-height: 44px; padding: 0 12px; border: 1px solid var(--app-field); border-radius: var(--radius-control, 8px); background: var(--app-panel); color: inherit; font: inherit; }
    .list { position: absolute; z-index: 20; inset-inline: 0; top: 100%; margin: 4px 0 0; padding: 4px; list-style: none; max-height: 260px; overflow: auto; background: var(--app-panel); border: 1px solid var(--app-line); border-radius: var(--radius-control, 8px); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
    li { padding: 8px 10px; border-radius: 6px; cursor: pointer; } li.on, li:hover { background: var(--app-hover, rgba(127,127,127,.14)); } li.custom { font-style: italic; color: var(--app-muted); }
  `,
})
export class PlacePickerComponent {
  readonly kind = input.required<'country' | 'city'>();
  readonly label = input.required<string>();
  /** For a city: the ISO code of its country, whose file is loaded when it changes. */
  readonly country = input<string | undefined>();
  /** A country's ISO code, or the city text. */
  readonly value = input<string | undefined>();
  readonly disabled = input(false);
  readonly placeholder = input<string | null>(null);
  /** The new value: an ISO code for a country, the text for a city. Empty when cleared. */
  readonly changed = output<string>();

  private readonly i18n = inject(I18n);
  private readonly geo = inject(GeoService);
  protected readonly listId = `den-place-${nextId++}`;
  protected readonly text = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  private readonly names = signal<readonly string[]>([]);

  protected readonly options = computed<Option[]>(() => {
    const q = this.text().trim();
    if (this.kind() === 'country') return searchCountries(q, this.i18n.lang()).map((c) => ({ value: c.code, label: countryName(c.code, this.i18n.lang()) }));
    const found = searchPlaces(this.names(), q).map((n) => ({ value: n, label: n }));
    return q && !found.some((o) => fold(o.value) === fold(q)) ? [...found, { value: q, label: this.i18n.t('place.use', { name: q }), custom: true }] : found;
  });

  constructor() {
    // The shown text follows the stored value (and the interface language, for a country name).
    effect(() => {
      const v = this.value();
      const lang = this.i18n.lang();
      untracked(() => this.text.set(this.kind() === 'country' ? (v && countryOf(v) ? countryName(v, lang) : '') : v ?? ''));
    });
    effect(() => {
      const code = this.kind() === 'city' ? this.country() : undefined;
      let current = true;
      this.names.set([]);
      if (code) void this.geo.cities(code).then((list) => { if (current) this.names.set(list); });
      return () => { current = false; };
    });
  }

  protected type(v: string): void { this.text.set(v); this.open.set(true); this.active.set(0); }

  protected pick(o: Option): void {
    this.text.set(this.kind() === 'country' ? o.label : o.value);
    this.open.set(false);
    this.changed.emit(o.value);
  }

  /** Leaving the field keeps what was typed for a city; for a country it must be a country, otherwise the old one comes back. */
  protected commit(): void {
    this.open.set(false);
    const q = this.text().trim();
    if (this.kind() === 'city') { if (q !== (this.value() ?? '')) this.changed.emit(q); return; }
    const exact = this.options().find((o) => fold(o.label) === fold(q));
    if (exact) { if (exact.value !== this.value()) this.changed.emit(exact.value); }
    else if (!q && this.value()) this.changed.emit('');
    else { const v = this.value(); this.text.set(v ? countryName(v, this.i18n.lang()) : ''); }
  }

  protected key(e: KeyboardEvent): void {
    const n = this.options().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.open.set(true); this.active.set(n ? (this.active() + 1) % n : 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.active.set(n ? (this.active() - 1 + n) % n : 0); }
    else if (e.key === 'Enter' && this.open() && n) { e.preventDefault(); this.pick(this.options()[this.active()]); }
    else if (e.key === 'Escape') this.open.set(false);
  }
}
