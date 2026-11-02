import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ToothRecord } from './engine/chart';

export type CubeSurface = 'buccal' | 'mesial' | 'occlusal' | 'distal' | 'lingual';

// The tooth seen from the biting side, cut into its five surfaces; the outline follows the tooth type.
const ZONES: Record<CubeSurface, { pts: string; cx: number; cy: number }> = {
  buccal: { pts: '0,0 100,0 72,32 28,32', cx: 50, cy: 14 },
  lingual: { pts: '0,100 100,100 72,68 28,68', cx: 50, cy: 86 },
  mesial: { pts: '0,0 28,32 28,68 0,100', cx: 12, cy: 50 }, // left slot; swapped with distal on the other half of the chart
  distal: { pts: '100,0 72,32 72,68 100,100', cx: 88, cy: 50 },
  occlusal: { pts: '28,32 72,32 72,68 28,68', cx: 50, cy: 50 },
};
const FILL: Record<string, string> = { amalgam: '#6b7890', composite: '#29b8d9', 'glass-ionomer': '#9fd640', temporary: '#f580ad' };
const DOTS: [number, number][] = [[-5, -3], [4, -5], [1, 4], [-6, 5], [6, 3]];

/** The five surfaces of one tooth as a shaped, clickable drawing: buccal on top, lingual below, occlusal (incisal) in the middle, mesial toward the midline. */
@Component({
  selector: 'den-surface-cube',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 100 100" role="group" [attr.aria-label]="'Tooth ' + no()">
      <defs><clipPath [attr.id]="clip()"><rect [attr.x]="shape().x" [attr.y]="shape().y" [attr.width]="shape().w" [attr.height]="shape().h" [attr.rx]="shape().r" /></clipPath></defs>
      <g [attr.clip-path]="'url(#' + clip() + ')'">
        @for (f of faces(); track f.key) {
          <polygon class="z" [class.sel]="marked().includes(f.key)" [class.ro]="readonly()" [attr.points]="f.pts" [attr.fill]="f.fill" tabindex="0" role="button" [attr.aria-label]="f.key + ' ' + f.state"
            (click)="!readonly() && pick.emit(f.key)" (keydown.enter)="!readonly() && pick.emit(f.key)" />
          @if (f.state === 'caries') { @for (d of dots; track $index) { <circle [attr.cx]="f.cx + d[0] * 1.6" [attr.cy]="f.cy + d[1] * 1.6" r="3.2" fill="#000" pointer-events="none" /> } }
        }
      </g>
      <rect class="edge" [attr.x]="shape().x" [attr.y]="shape().y" [attr.width]="shape().w" [attr.height]="shape().h" [attr.rx]="shape().r" fill="none" pointer-events="none" />
      @for (f of faces(); track f.key) { @if (marked().includes(f.key)) { <polygon class="selring" [attr.points]="f.pts" [attr.clip-path]="'url(#' + clip() + ')'" pointer-events="none" /> } }
    </svg>
  `,
  styles: `
    :host { display: block; width: 100%; max-width: 40px; margin-inline: auto; aspect-ratio: 1; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .z { stroke: #8a94a0; stroke-width: 2; cursor: pointer; outline: none; transition: filter .1s; }
    .z.ro { cursor: default; }
    .z:not(.ro):hover, .z:focus-visible { filter: brightness(.88) saturate(1.3); stroke: #0f172a; }
    .edge { stroke: #5b6572; stroke-width: 3; }
    .selring { fill: none; stroke: #16a34a; stroke-width: 7; }
  `,
})
export class SurfaceCubeComponent {
  readonly state = input.required<ToothRecord>();
  readonly no = input.required<number>();
  readonly readonly = input(false);
  /** Surfaces currently selected in the 3D view. */
  readonly marked = input<readonly string[]>([]);
  readonly pick = output<CubeSurface>();
  protected readonly dots = DOTS;

  protected readonly clip = computed(() => `tz${this.no()}`);
  protected readonly shape = computed(() => {
    const k = this.no() % 10;
    return k >= 6 ? { x: 3, y: 5, w: 94, h: 90, r: 28 } : k >= 4 ? { x: 12, y: 6, w: 76, h: 88, r: 38 } : k === 3 ? { x: 22, y: 8, w: 56, h: 84, r: 28 } : { x: 3, y: 22, w: 94, h: 56, r: 16 };
  });
  protected readonly faces = computed(() => {
    const t = this.state();
    const q = Math.floor(this.no() / 10);
    const mesialRight = q === 1 || q === 4 || q === 5 || q === 8; // left half of the chart: the midline is on the right
    const swap = (k: CubeSurface): CubeSurface => (mesialRight ? (k === 'mesial' ? 'distal' : k === 'distal' ? 'mesial' : k) : k);
    return (Object.keys(ZONES) as CubeSurface[]).map((slot) => {
      const key = swap(slot), z = ZONES[slot];
      const filled = t.fillingSurfaces.has(key), caries = t.caries.has('caries-' + key);
      const mat = String(t.fillingSurfaceMaterials.get(key) ?? t.fillingMaterial);
      const state = filled ? 'fill' : caries ? 'caries' : 'none';
      return { key, pts: z.pts, cx: z.cx, cy: z.cy, state, fill: filled ? (FILL[mat] ?? '#2563eb') : caries ? '#8c0d1a' : '#ffffff' };
    });
  });
}
