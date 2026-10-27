import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import type { ToothRecord } from './engine/chart';
import type { ToothEdit } from './engine/edits';
import { PERIO_SITES, furcationEntrances } from './engine/vendor/state/payload';
import { label } from './labels';

/** Six-site probing for one tooth. Sites need a probing depth first; CAL is derived (PD + gingival margin), never stored. */
@Component({
  selector: 'den-perio-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!allowed()) { <p class="hint">{{ t('dc.perio.na') }}</p> } @else {
      <div class="scroll"><table>
        <caption class="sr-only">{{ t('dc.perio.title', { n: no() }) }}</caption>
        <thead><tr><th scope="col">{{ t('dc.perio.site') }}</th><th scope="col">PD</th><th scope="col">GM</th><th scope="col">CAL</th><th scope="col">BOP</th><th scope="col">{{ t('dc.perio.sup') }}</th></tr></thead>
        <tbody>
          @for (site of sites; track site) {
            <tr>
              <th scope="row">{{ site }}</th>
              <td><input class="input num" type="number" inputmode="numeric" min="0" max="15" step="1" [disabled]="disabled()" [attr.aria-label]="'PD ' + site" [value]="pd(site) ?? ''" (change)="setPd(site, $event)" /></td>
              <td><input class="input num" type="number" inputmode="numeric" min="-10" max="20" step="1" [disabled]="disabled() || pd(site) === null" [attr.aria-label]="'GM ' + site" [value]="gm(site) ?? ''" (change)="setGm(site, $event)" /></td>
              <td class="cal">{{ cal(site) ?? '–' }}</td>
              <td><input type="checkbox" [disabled]="disabled() || pd(site) === null" [attr.aria-label]="'BOP ' + site" [checked]="inSet('bop', site)" (change)="edit.emit({ kind: 'perio', site, bop: checked($event) })" /></td>
              <td><input type="checkbox" [disabled]="disabled() || pd(site) === null" [attr.aria-label]="t('dc.perio.sup') + ' ' + site" [checked]="inSet('sup', site)" (change)="edit.emit({ kind: 'perio', site, sup: checked($event) })" /></td>
            </tr>
          }
        </tbody>
      </table></div>
      <div class="scroll"><table>
        <caption class="sr-only">{{ t('dc.idx.title') }}</caption>
        <thead><tr><th scope="col">{{ t('dc.idx.title') }}</th><th scope="col">{{ t('dc.idx.plaque') }}</th><th scope="col">{{ t('dc.idx.pi') }}</th><th scope="col">{{ t('dc.idx.gi') }}</th></tr></thead>
        <tbody>
          @for (s of surfaces; track s) {
            <tr>
              <th scope="row">{{ t(surfaceKey[s]) }}</th>
              <td><input type="checkbox" [disabled]="disabled()" [attr.aria-label]="t('dc.idx.plaque') + ' ' + s" [checked]="state().plaque.has(s)" (change)="edit.emit({ kind: 'plaque', surface: s, on: checked($event) })" /></td>
              @for (k of indices; track k) {
                <td><select class="input num" [disabled]="disabled()" [attr.aria-label]="k.toUpperCase() + ' ' + s" (change)="setIndex(k, s, $event)">
                  @for (g of [0,1,2,3]; track g) { <option [value]="g" [selected]="grade(k, s) === g">{{ g }}</option> }
                </select></td>
              }
            </tr>
          }
        </tbody>
      </table></div>
      @if (entrances().length) {
        <div class="furc">
          @for (en of entrances(); track en) {
            <label class="field"><span class="label">{{ t('dc.perio.furcation') }} · {{ name(en) }}</span>
              <select class="input" [disabled]="disabled()" (change)="setFurcation(en, $event)">
                <option value="" [selected]="furcation(en) === null">–</option>
                @for (g of [1,2,3,4]; track g) { <option [value]="g" [selected]="furcation(en) === g">{{ ['I','II','III','IV'][g-1] }}</option> }
              </select></label>
          }
        </div>
      }
    }
  `,
  styles: `
    :host { display: grid; gap: 12px; }
    .scroll { overflow-x: auto; }
    table { border-collapse: collapse; font-size: 13px; }
    th, td { padding: 4px 8px; text-align: center; border-bottom: 1px solid var(--app-line); }
    thead th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--app-muted); }
    .num { width: 64px; min-height: 32px; text-align: center; padding: 0 6px; }
    .cal { font-weight: 600; font-variant-numeric: tabular-nums; }
    .hint { color: var(--app-muted); margin: 0; }
    .furc { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
  `,
})
export class PerioEditorComponent {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  readonly no = input.required<number>();
  readonly state = input.required<ToothRecord>();
  readonly disabled = input(false);
  readonly edit = output<ToothEdit>();
  protected readonly sites = PERIO_SITES;
  protected readonly surfaces = ['mesial', 'distal', 'buccal', 'lingual'] as const;
  protected readonly surfaceKey = { mesial: 'dc.idx.mesial', distal: 'dc.idx.distal', buccal: 'dc.idx.buccal', lingual: 'dc.idx.lingual' } as const;
  protected readonly indices = ['pi', 'gi'] as const;
  protected grade(k: 'pi' | 'gi', s: string): number { return (this.state()[k] as Map<string, number>).get(s) ?? 0; }
  protected setIndex(k: 'pi' | 'gi', s: string, e: Event): void { this.edit.emit({ kind: 'index', index: k, surface: s, grade: Number((e.target as HTMLSelectElement).value) }); }

  protected readonly allowed = computed(() => { const s = String(this.state().toothSelection); return s === 'tooth-base' || s === 'milktooth'; });
  protected readonly entrances = computed(() => (this.allowed() ? furcationEntrances(this.no()) : []));
  protected name(c: string): string { return label(c, this.i18n.lang()); }
  protected checked(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected pd(site: string): number | null { return this.state().perio.pd.get(site) ?? null; }
  protected gm(site: string): number | null { return this.state().perio.gm.get(site) ?? null; }
  protected cal(site: string): number | null { const p = this.pd(site); return p === null ? null : p + (this.gm(site) ?? 0); }
  protected inSet(k: 'bop' | 'sup', site: string): boolean { return this.state().perio[k].has(site); }
  protected furcation(en: string): number | null { return this.state().furcation.get(en) ?? null; }
  protected setPd(site: string, e: Event): void {
    const raw = (e.target as HTMLInputElement).value.trim();
    this.edit.emit({ kind: 'perio', site, pd: raw === '' ? null : Number(raw) });
  }
  protected setGm(site: string, e: Event): void {
    const raw = (e.target as HTMLInputElement).value.trim();
    if (raw !== '') this.edit.emit({ kind: 'perio', site, gm: Number(raw) });
  }
  protected setFurcation(entrance: string, e: Event): void {
    const raw = (e.target as HTMLSelectElement).value;
    this.edit.emit({ kind: 'furcation', entrance, grade: raw === '' ? null : Number(raw) });
  }
}
