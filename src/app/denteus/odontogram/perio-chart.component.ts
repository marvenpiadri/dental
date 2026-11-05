import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { ALL_TEETH, readChart, type Chart } from './engine/chart';
import type { Examination } from './engine/exam';
import type { ToothEdit } from './engine/edits';
import { SURFACE_SITES, chartViz, pdChange, perioStats, pocketTone, toothViz, type PerioSiteId, type SiteViz, type ToothViz } from './perio-viz';
import { ToothTileComponent } from './tooth-tile.component';

export type PerioLayer = 'depth' | 'recession' | 'bleeding' | 'plaque' | 'furcation' | 'mobility' | 'bone';
export const PERIO_LAYERS: readonly PerioLayer[] = ['depth', 'recession', 'bleeding', 'plaque', 'furcation', 'mobility', 'bone'];
export interface PerioSel { tooth: number; site: PerioSiteId }
const BUCCAL: readonly PerioSiteId[] = ['MB', 'B', 'DB'], LINGUAL: readonly PerioSiteId[] = ['ML', 'L', 'DL'];
const STRIP = 64, UNIT = 4.5; // graph strip height and pixels per mm

interface Cell { site: PerioSiteId; s: SiteViz | null; plaque: boolean; tone: 'nil' | 'shallow' | 'watch' | 'deep' }
interface Col { no: number; v: ToothViz | null; cells: Cell[]; poly: string; margin: string; tone: string }

/**
 * The periodontal mode of the one patient chart: the same tooth tiles, numbering and hidden-tooth rule as the odontogram,
 * with the six probing sites and findings drawn around each tooth. It stores nothing; edits leave as the ToothEdit the sheet emits.
 */
@Component({
  selector: 'den-periodontogram',
  imports: [ToothTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './perio-chart.component.html',
  styleUrl: './perio-chart.component.css',
})
export class PeriodontogramComponent {
  readonly chart = input.required<Chart>();
  readonly selected = input<PerioSel | null>(null);
  readonly disabled = input(false);
  readonly examinations = input<readonly Examination[]>([]);
  /** Same rules as the odontogram: which teeth it leaves out, and how it numbers them. */
  readonly hidden = input<(n: number) => boolean>(() => false);
  readonly numbering = input<(n: number) => string>((n) => String(n));
  readonly showBase = input(true);
  readonly showHealthyPulp = input(true);
  readonly select = output<PerioSel | null>();
  readonly edit = output<{ tooth: number; edit: ToothEdit }>();

  protected readonly t = inject(I18n).t;
  protected readonly side = signal<'buccal' | 'lingual'>('buccal');
  protected readonly layers = signal<ReadonlySet<PerioLayer>>(new Set<PerioLayer>(['depth', 'recession', 'bleeding', 'plaque', 'furcation', 'mobility']));
  protected readonly compareId = signal('');
  protected readonly before = computed<Chart | null>(() => { const e = this.examinations().find((x) => x.id === this.compareId()); return e ? (readChart(e.chart).chart ?? null) : null; });
  protected readonly stats = computed(() => perioStats(this.chart(), this.before()));
  protected readonly changes = computed(() => { const p = this.panel(), b = this.before(); return p.v ? p.sites.map((s) => pdChange(p.v, p.tooth === null || !b ? null : toothViz(b, p.tooth), s.site)) : []; });
  protected setCompare(e: Event): void { this.compareId.set((e.target as HTMLSelectElement).value); }
  private readonly host0 = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Enter in a PD box moves to the next site, then to the next tooth: probing without leaving the keyboard. */
  protected advance(i: number): void {
    const boxes = () => Array.from(this.host0.nativeElement.querySelectorAll<HTMLInputElement>('.grid input[aria-label^="PD"]'));
    if (i < boxes().length - 1) boxes()[i + 1].focus();
    else { this.step(1); setTimeout(() => boxes()[0]?.focus()); }
  }
  protected readonly panel = computed(() => {
    const sel = this.selected(), tooth = sel?.tooth ?? null, v = tooth === null ? null : toothViz(this.chart(), tooth);
    const names = this.side() === 'buccal' ? BUCCAL : LINGUAL;
    return { tooth, v, sites: v ? names.map((n) => v.sites.find((x) => x.site === n)!) : [], site: sel?.site ?? null };
  });
  protected readonly layerGroups: { key: 'dc.pv.g.probing' | 'dc.pv.g.findings' | 'dc.pv.g.structure'; items: readonly PerioLayer[] }[] = [
    { key: 'dc.pv.g.probing', items: ['depth', 'recession', 'bone'] }, { key: 'dc.pv.g.findings', items: ['bleeding', 'plaque'] }, { key: 'dc.pv.g.structure', items: ['furcation', 'mobility'] },
  ];
  protected readonly surfaces = ['buccal', 'lingual', 'mesial', 'distal'] as const;
  protected surfaceName(sf: string) { return this.t(`dc.idx.${sf}` as 'dc.idx.buccal'); }
  protected readonly swatch: Record<PerioLayer, string> = { depth: 'linear-gradient(90deg,#7a96ab 33%,#df8a2f 33% 66%,#c0392b 66%)', recession: '#d8c48f', bleeding: '#b3202a', plaque: '#8fb4e8', furcation: '#252b2f', mobility: 'linear-gradient(90deg,#2b3236 20%,transparent 20% 80%,#2b3236 80%)', bone: '#bdbdbd' };
  private readonly followSide = effect(() => { const s = this.selected(); if (s) this.side.set((LINGUAL as readonly string[]).includes(s.site) ? 'lingual' : 'buccal'); });
  protected layerName(l: PerioLayer) { return this.t(`dc.pv.${l}` as 'dc.pv.depth'); }
  protected toggle(l: PerioLayer): void { const n = new Set(this.layers()); if (!n.delete(l)) n.add(l); this.layers.set(n); }
  protected pick(tooth: number, site: PerioSiteId): void { this.select.emit({ tooth, site }); }
  protected pickTooth(tooth: number): void { const cur = this.selected(); this.select.emit({ tooth, site: cur?.tooth === tooth ? cur.site : (this.side() === 'buccal' ? 'B' : 'L') }); }
  protected setPd(site: PerioSiteId, e: Event): void { const t = this.panel().tooth; if (t !== null) { const raw = (e.target as HTMLInputElement).value.trim(); this.edit.emit({ tooth: t, edit: { kind: 'perio', site, pd: raw === '' ? null : Number(raw) } }); } }
  protected setGm(site: PerioSiteId, e: Event): void { const t = this.panel().tooth, raw = (e.target as HTMLInputElement).value.trim(); if (t !== null && raw !== '') this.edit.emit({ tooth: t, edit: { kind: 'perio', site, gm: Number(raw) } }); }
  protected flag(site: PerioSiteId, k: 'bop' | 'sup', on: boolean): void { const t = this.panel().tooth; if (t !== null) this.edit.emit({ tooth: t, edit: { kind: 'perio', site, [k]: !on } }); }
  protected readonly teeth = computed(() => chartViz(this.chart()).map((v) => v.tooth));
  /** Move to the neighbouring tooth, keeping the same surface and position. */
  protected step(d: -1 | 1): void { const list = this.teeth(), cur = this.panel().tooth; if (!list.length) return; const i = cur === null ? (d > 0 ? 0 : list.length - 1) : (list.indexOf(cur) + d + list.length) % list.length; this.select.emit({ tooth: list[i], site: this.selected()?.site ?? (this.side() === 'buccal' ? 'B' : 'L') }); }

  /** Both arches in odontogram order; each column carries its three sites of the surface being viewed, left to right as seen on the chart. */
  protected readonly arches = computed(() => {
    const chart = this.chart(), names = this.side() === 'buccal' ? BUCCAL : LINGUAL;
    const build = (no: number): Col => {
      const v = toothViz(chart, no), q = Math.floor(no / 10), ordered = q === 1 || q === 4 ? [...names].reverse() : [...names]; // distal first on the right-hand quadrants
      const cells = ordered.map((site): Cell => {
        const s = v?.sites.find((x) => x.site === site) ?? null, surface = Object.entries(SURFACE_SITES).find(([, l]) => l.includes(site))?.[0] ?? '';
        return { site, s, plaque: !!v?.plaque.has(surface), tone: s?.pd == null ? 'nil' : pocketTone(s.pd) };
      });
      const upper = no < 30, Y = (mm: number) => Math.round((upper ? STRIP - Math.min(mm * UNIT, STRIP) : Math.min(mm * UNIT, STRIP)) * 10) / 10;
      const pts = cells.map((c, i) => (c.s?.pd == null ? null : { x: i + 0.5, m: Y(c.s.gm ?? 0), b: Y((c.s.gm ?? 0) + c.s.pd) }));
      const have = pts.filter((p): p is { x: number; m: number; b: number } => !!p);
      const first = have[0], last = have[have.length - 1];
      const top = first ? [{ ...first, x: 0 }, ...have, { ...last, x: 3 }] : [];
      const worst = Math.max(0, ...cells.map((c) => c.s?.pd ?? 0));
      return { no, v, cells, tone: worst ? pocketTone(worst) : 'nil', margin: top.map((p) => `${p.x},${p.m}`).join(' '), poly: top.length ? [...top.map((p) => `${p.x},${p.m}`), ...[...top].reverse().map((p) => `${p.x},${p.b}`)].join(' ') : '' };
    };
    return [{ key: 'upper', cols: ALL_TEETH.slice(0, 16).map(build) }, { key: 'lower', cols: ALL_TEETH.slice(16).map(build) }];
  });
  protected readonly strip = STRIP;
}
