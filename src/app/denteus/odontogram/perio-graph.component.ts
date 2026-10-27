import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { ALL_TEETH, type Chart } from './engine/chart';

export interface GraphBar { site: string; pd: number; bop: boolean }
export interface GraphTooth { no: number; buccal: (GraphBar | null)[]; lingual: (GraphBar | null)[] }

const BUCCAL = ['MB', 'B', 'DB'] as const;
const LINGUAL = ['ML', 'L', 'DL'] as const;

/** Probing depths per tooth for the picture. Only charted sites become bars: no probing means no bar, never a zero. */
export function graphTeeth(chart: Chart): GraphTooth[] {
  return ALL_TEETH.map((no) => {
    const t = chart.status.get(no);
    const bar = (site: string): GraphBar | null => {
      const pd = t?.perio.pd.get(site);
      return pd === undefined ? null : { site, pd, bop: t!.perio.bop.has(site) };
    };
    return { no, buccal: BUCCAL.map(bar), lingual: LINGUAL.map(bar) };
  });
}

const W = 8, GAP = 2, TOOTH_W = W * 3 + GAP * 2 + 6, UNIT = 5, MAX = 12;

/** Whole-mouth probing picture: one bar per probed site, tall = deep, red dot = bleeding. A summary of the editor, not a second place to edit. */
@Component({
  selector: 'den-perio-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (any()) {
      <div class="scroll">
        @for (arch of arches(); track $index) {
          <svg role="img" [attr.aria-label]="t('dc.graph.aria')" [attr.viewBox]="'0 0 ' + width + ' ' + height" [style.min-width.px]="width">
            @for (tooth of arch; track tooth.no; let i = $index) {
              <g [attr.transform]="'translate(' + i * toothW + ',0)'">
                <text class="no" [attr.x]="toothW / 2 - 3" [attr.y]="height / 2 + 4" text-anchor="middle">{{ tooth.no }}</text>
                @for (row of [tooth.buccal, tooth.lingual]; track $index; let r = $index) {
                  @for (b of row; track $index; let k = $index) {
                    @if (b) {
                      <rect [attr.x]="k * (w + gap)" [attr.y]="r === 0 ? mid - 14 - h(b.pd) : mid + 14" [attr.width]="w" [attr.height]="h(b.pd)" [attr.data-depth]="tone(b.pd)"><title>{{ tooth.no }} {{ b.site }}: {{ b.pd }} mm</title></rect>
                      @if (b.bop) { <circle class="bop" [attr.cx]="k * (w + gap) + w / 2" [attr.cy]="r === 0 ? mid - 14 - h(b.pd) - 4 : mid + 14 + h(b.pd) + 4" r="2.4" /> }
                    }
                  }
                }
              </g>
            }
          </svg>
        }
      </div>
      <p class="legend"><span data-depth="ok"></span>≤3 mm <span data-depth="warn"></span>4–5 mm <span data-depth="bad"></span>≥6 mm <span class="dot"></span>{{ t('dc.graph.bop') }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .scroll { overflow-x: auto; display: grid; gap: 8px; }
    svg { display: block; width: 100%; max-width: 640px; height: auto; }
    .no { font-size: 9px; fill: var(--app-muted); }
    rect[data-depth='ok'] { fill: var(--app-muted); }
    rect[data-depth='warn'] { fill: #d97706; }
    rect[data-depth='bad'] { fill: var(--app-danger, #dc2626); }
    .bop { fill: var(--app-danger, #dc2626); }
    .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 8px 0 0; font-size: 12px; color: var(--app-muted); }
    .legend span { display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: var(--app-muted); }
    .legend span[data-depth='warn'] { background: #d97706; } .legend span[data-depth='bad'] { background: var(--app-danger, #dc2626); }
    .legend .dot { border-radius: 50%; background: var(--app-danger, #dc2626); }
  `,
})
export class PerioGraphComponent {
  readonly chart = input.required<Chart>();
  protected readonly t = inject(I18n).t;
  protected readonly w = W; protected readonly gap = GAP; protected readonly toothW = TOOTH_W;
  protected readonly width = TOOTH_W * 16;
  protected readonly height = (MAX * UNIT + 14 + 8) * 2 + 4;
  protected readonly mid = this.height / 2;

  private readonly teeth = computed(() => graphTeeth(this.chart()));
  protected readonly any = computed(() => this.teeth().some((x) => [...x.buccal, ...x.lingual].some(Boolean)));
  protected readonly arches = computed(() => [this.teeth().slice(0, 16), this.teeth().slice(16)]);
  protected h(pd: number): number { return Math.min(pd, MAX) * UNIT; }
  protected tone(pd: number): 'ok' | 'warn' | 'bad' { return pd >= 6 ? 'bad' : pd >= 4 ? 'warn' : 'ok'; }
}
