import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import type { Chart } from './engine/chart';
import { OVERRIDE_VALUES, classifyPerio, perioSummary, readCaseMeta, type CaseMeta } from './engine/perio';

type OverrideKey = keyof typeof OVERRIDE_VALUES;

/** Whole-mouth periodontal picture: probing summary, case risk data and the 2017 classification (suggested, overridable). */
@Component({
  selector: 'den-perio-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chips">
      <span class="chip" data-tone="neutral">{{ t('dc.ps.sites', { n: sum().chartedSites }) }}</span>
      <span class="chip" [attr.data-tone]="sum().bopPercent >= 10 ? 'warn' : 'ok'">BOP {{ sum().bopPercent }}%</span>
      @if (sum().maxPd !== null) { <span class="chip" data-tone="neutral">{{ t('dc.ps.maxPd', { n: sum().maxPd! }) }}</span> }
    </div>
    <div class="grid">
      <label class="field"><span class="label">{{ t('dc.ps.age') }}</span><input class="input" type="number" min="0" max="120" [disabled]="disabled()" [value]="meta().age ?? ''" (change)="num('age', $event)" /></label>
      <label class="field"><span class="label">{{ t('dc.ps.smoking') }}</span>
        <select class="input" [disabled]="disabled()" (change)="patch.emit({ smokingStatus: sel($event) })">
          @for (o of smoking; track o) { <option [value]="o" [selected]="o === meta().smokingStatus">{{ t(smokeKey[o]) }}</option> }
        </select></label>
      <label class="field"><span class="label">{{ t('dc.ps.cigs') }}</span><input class="input" type="number" min="0" max="99" [disabled]="disabled()" [value]="meta().cigarettesPerDay ?? ''" (change)="num('cigarettesPerDay', $event)" /></label>
      <label class="field"><span class="label">{{ t('dc.ps.diabetes') }}</span>
        <select class="input" [disabled]="disabled()" (change)="patch.emit({ diabetesStatus: sel($event) })">
          @for (o of diabetes; track o) { <option [value]="o" [selected]="o === meta().diabetesStatus">{{ t(diaKey[o]) }}</option> }
        </select></label>
      <label class="field"><span class="label">HbA1c %</span><input class="input" type="number" min="3" max="20" step="0.1" [disabled]="disabled()" [value]="meta().hba1c ?? ''" (change)="num('hba1c', $event)" /></label>
      <label class="field"><span class="label">{{ t('dc.ps.rbl') }}</span><input class="input" type="number" min="0" max="100" [disabled]="disabled()" [value]="meta().maxRblPercent ?? ''" (change)="num('maxRblPercent', $event)" /></label>
      <label class="field"><span class="label">{{ t('dc.ps.loss') }}</span><input class="input" type="number" min="0" max="32" [disabled]="disabled()" [value]="meta().toothLossPerio ?? ''" (change)="num('toothLossPerio', $event)" /></label>
    </div>
    <h3>{{ t('dc.ps.classification') }}</h3>
    @if (result(); as r) {
      <p class="hint">{{ t('dc.ps.hint') }}</p>
      <div class="grid">
        @for (a of axes; track a.key) {
          <label class="field"><span class="label">{{ t(a.label) }} <span class="chip" [attr.data-tone]="overridden(a.key) ? 'info' : 'warn'">{{ overridden(a.key) ? t('dc.ps.override') : t('dc.dx.suggested') }}</span></span>
            <select class="input" [disabled]="disabled()" (change)="override(a.key, $event)">
              <option value="" [selected]="!meta()[a.key]">{{ t('dc.ps.derived', { v: derivedOf(a.key) }) }}</option>
              @for (v of values[a.key]; track v) { <option [value]="v" [selected]="meta()[a.key] === v">{{ v }}</option> }
            </select></label>
        }
      </div>
    } @else { <p class="hint">{{ t('dc.ps.none') }}</p> }
  `,
  styles: `
    :host { display: grid; gap: 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
    h3 { margin: 6px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--app-muted); }
    .hint { margin: 0; font-size: 13px; color: var(--app-muted); }
  `,
})
export class PerioSummaryComponent {
  protected readonly t = inject(I18n).t;
  readonly chart = input.required<Chart>();
  readonly disabled = input(false);
  readonly patch = output<Partial<CaseMeta>>();

  protected readonly sum = computed(() => perioSummary(this.chart()));
  protected readonly meta = computed(() => readCaseMeta(this.chart().caseMeta));
  protected readonly result = computed(() => classifyPerio(this.chart()));
  protected readonly values = OVERRIDE_VALUES;
  protected readonly smoking = ['unknown', 'never', 'former', 'current'] as const;
  protected readonly diabetes = ['unknown', 'none', 'present'] as const;
  protected readonly smokeKey = { unknown: 'dc.ps.unknown', never: 'dc.ps.never', former: 'dc.ps.former', current: 'dc.ps.current' } as const;
  protected readonly diaKey = { unknown: 'dc.ps.unknown', none: 'dc.ps.no', present: 'dc.ps.yes' } as const;
  protected readonly axes = [
    { key: 'diagnosisOverride', label: 'dc.ps.diagnosis' }, { key: 'stageOverride', label: 'dc.ps.stage' },
    { key: 'gradeOverride', label: 'dc.ps.grade' }, { key: 'extentOverride', label: 'dc.ps.extent' },
  ] as const;

  protected sel(e: Event): never { return (e.target as HTMLSelectElement).value as never; }
  protected num(k: 'age' | 'cigarettesPerDay' | 'hba1c' | 'maxRblPercent' | 'toothLossPerio', e: Event): void {
    const raw = (e.target as HTMLInputElement).value.trim();
    this.patch.emit({ [k]: raw === '' ? null : Number(raw) });
  }
  protected overridden(k: OverrideKey): boolean { const o = this.result()?.overridden; return !!o && o[k.replace('Override', '') as 'diagnosis']; }
  protected derivedOf(k: OverrideKey): string { const d = this.result()?.derived; return d ? String(d[k.replace('Override', '') as 'diagnosis']) : ''; }
  protected override(k: OverrideKey, e: Event): void { const v = (e.target as HTMLSelectElement).value; this.patch.emit({ [k]: v === '' ? null : v }); }
}
