import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { ALL_TEETH, isBlankTooth, type Chart } from './engine/chart';
import type { ToothEdit } from './engine/edits';
import type { PerioSel } from './perio-3d.component';

const BUCCAL = ['MB', 'B', 'DB'] as const;
const LINGUAL = ['ML', 'L', 'DL'] as const;
type Mode = 'pd' | 'gm' | 'bop';

export interface SheetRow { tooth: number; sites: { site: string; pd: number | null; gm: number | null; bop: boolean }[] }

/** One row per present tooth with its six sites; teeth that are missing, implants or blank wisdom teeth are left out. */
export function sheetRows(chart: Chart): SheetRow[] {
  return ALL_TEETH.flatMap((tooth) => {
    const t = chart.status.get(tooth);
    const sel = String(t?.toothSelection);
    if (!t || (sel !== 'tooth-base' && sel !== 'milktooth') || (!chart.globals.wisdomVisible && tooth % 10 === 8 && isBlankTooth(chart, tooth))) return [];
    return [{ tooth, sites: [...BUCCAL, ...LINGUAL].map((site) => ({ site, pd: t.perio.pd.get(site) ?? null, gm: t.perio.gm.get(site) ?? null, bop: t.perio.bop.has(site) })) }];
  });
}

/** Whole-mouth probing in one table: type depths tooth by tooth with Tab, then switch to recession or bleeding. */
@Component({
  selector: 'den-perio-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <div class="seg" role="group" [attr.aria-label]="t('dc.perio.sheet')">
        @for (m of modes; track m.id) { <button type="button" [class.on]="mode() === m.id" [attr.aria-pressed]="mode() === m.id" (click)="mode.set(m.id)">{{ t(m.key) }}</button> }
      </div>
      <span class="hint">{{ t('dc.perio.sheetHint') }}</span>
    </div>
    <div class="scroll"><table>
      <caption class="sr-only">{{ t('dc.perio.sheet') }}</caption>
      <thead><tr><th scope="col">#</th><th scope="colgroup" colspan="3">{{ t('dc.idx.buccal') }}</th><th scope="colgroup" colspan="3">{{ t('dc.idx.lingual') }}</th></tr></thead>
      <tbody>
        @for (r of rows(); track r.tooth) {
          <tr>
            <th scope="row">{{ r.tooth }}</th>
            @for (s of r.sites; track s.site) {
              <td [class.sel]="selected()?.tooth === r.tooth && selected()?.site === s.site" [attr.data-k]="r.tooth + '-' + s.site" (focusin)="pick.emit({ tooth: r.tooth, site: $any(s.site) })" (click)="pick.emit({ tooth: r.tooth, site: $any(s.site) })">
                @switch (mode()) {
                  @case ('pd') { <input class="input num" type="number" inputmode="numeric" min="0" max="15" [disabled]="disabled()" [attr.aria-label]="'PD ' + r.tooth + ' ' + s.site" [value]="s.pd ?? ''" (change)="setPd(r.tooth, s.site, $event)" /> }
                  @case ('gm') { <input class="input num" type="number" inputmode="numeric" min="-10" max="20" [disabled]="disabled() || s.pd === null" [attr.aria-label]="'GM ' + r.tooth + ' ' + s.site" [value]="s.gm ?? ''" (change)="setGm(r.tooth, s.site, $event)" /> }
                  @default { <button type="button" class="bop" [class.on]="s.bop" [disabled]="disabled() || s.pd === null" [attr.aria-pressed]="s.bop" [attr.aria-label]="'BOP ' + r.tooth + ' ' + s.site" (click)="edit.emit({ tooth: r.tooth, edit: { kind: 'perio', site: s.site, bop: !s.bop } })">{{ s.pd ?? '–' }}</button> }
                }
              </td>
            }
          </tr>
        }
      </tbody>
    </table></div>
  `,
  styles: `
    :host { display: grid; gap: 10px; }
    .head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .seg { display: inline-flex; border: 1px solid var(--app-line); border-radius: 999px; padding: 3px; background: var(--app-subtle); }
    .seg button { all: unset; cursor: pointer; padding: 5px 12px; border-radius: 999px; font-weight: 600; font-size: 13px; color: var(--app-muted); }
    .seg button.on { background: var(--app-text); color: var(--app-bg); }
    .seg button:focus-visible { outline: 2px solid var(--app-text); outline-offset: 2px; }
    .hint { font-size: 12px; color: var(--app-muted); }
    .scroll { overflow: auto; max-height: 420px; border: 1px solid var(--app-line); border-radius: 12px; }
    table { border-collapse: collapse; font-size: 13px; width: 100%; }
    th, td { padding: 3px 4px; text-align: center; border-bottom: 1px solid var(--app-line); }
    thead th { position: sticky; top: 0; background: var(--app-panel, var(--app-bg)); font-size: 12px; color: var(--app-muted); z-index: 1; }
    tbody th { font-weight: 700; padding-inline: 8px; }
    td.sel { background: color-mix(in srgb, var(--app-accent) 18%, transparent); box-shadow: inset 0 0 0 2px var(--app-accent); }
    td:nth-child(4) { border-inline-start: 1px solid var(--app-line); }
    .num { width: 52px; min-height: 32px; text-align: center; padding: 0 4px; }
    .bop { min-width: 44px; min-height: 32px; border: 1px solid var(--app-line); border-radius: 8px; background: transparent; color: var(--app-text); cursor: pointer; font: inherit; }
    .bop.on { background: var(--app-danger); border-color: var(--app-danger); color: #fff; font-weight: 700; }
    .bop:disabled { opacity: .4; cursor: default; }
  `,
})
export class PerioSheetComponent {
  protected readonly t = inject(I18n).t;
  readonly chart = input.required<Chart>();
  readonly disabled = input(false);
  /** The site chosen in the table or the 3D view. */
  readonly selected = input<PerioSel | null>(null);
  readonly pick = output<PerioSel>();
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    effect(() => { const s = this.selected(); if (s) this.el.nativeElement.querySelector(`td[data-k="${s.tooth}-${s.site}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  }
  readonly edit = output<{ tooth: number; edit: ToothEdit }>();
  protected readonly mode = signal<Mode>('pd');
  protected readonly modes: { id: Mode; key: 'dc.perio.depth' | 'dc.perio.recession' | 'dc.perio.bleeding' }[] = [{ id: 'pd', key: 'dc.perio.depth' }, { id: 'gm', key: 'dc.perio.recession' }, { id: 'bop', key: 'dc.perio.bleeding' }];
  protected readonly rows = computed(() => sheetRows(this.chart()));
  protected setPd(tooth: number, site: string, e: Event): void {
    const raw = (e.target as HTMLInputElement).value.trim();
    this.edit.emit({ tooth, edit: { kind: 'perio', site, pd: raw === '' ? null : Number(raw) } });
  }
  protected setGm(tooth: number, site: string, e: Event): void {
    const raw = (e.target as HTMLInputElement).value.trim();
    if (raw !== '') this.edit.emit({ tooth, edit: { kind: 'perio', site, gm: Number(raw) } });
  }
}
