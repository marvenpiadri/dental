import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ToothRecord } from './engine/chart';

export type CubeSurface = 'buccal' | 'mesial' | 'occlusal' | 'distal' | 'lingual';

/** The five faces of one tooth as a small cross: buccal on top, lingual below, occlusal in the middle, mesial toward the midline. */
@Component({
  selector: 'den-surface-cube',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (f of faces(); track f.key) {
      <button type="button" class="f" [class.caries]="f.state === 'caries'" [class.fill]="f.state === 'fill'" [style.grid-area]="f.area"
        [disabled]="readonly()" [attr.aria-label]="f.key + ' ' + f.state" (click)="pick.emit(f.key)"></button>
    }
  `,
  styles: `
    :host { display: grid; grid-template: 'u u u' 6px 'l c r' 8px 'w w w' 6px / 7px 9px 7px; justify-content: center; gap: 1px; padding-block: 2px; }
    .f { all: unset; box-sizing: border-box; border: 1px solid var(--app-line); background: var(--app-field); cursor: pointer; }
    .f:disabled { cursor: default; }
    .f:not(:disabled):hover { border-color: var(--app-text); }
    .f.caries { background: #dc2626; border-color: #dc2626; }
    .f.fill { background: #2563eb; border-color: #2563eb; }
  `,
})
export class SurfaceCubeComponent {
  readonly state = input.required<ToothRecord>();
  readonly no = input.required<number>();
  readonly readonly = input(false);
  readonly pick = output<CubeSurface>();

  protected readonly faces = computed(() => {
    const t = this.state();
    const q = Math.floor(this.no() / 10);
    const mesialRight = q === 1 || q === 4 || q === 5 || q === 8; // left half of the chart: the midline is on the right
    const area: Record<CubeSurface, string> = { buccal: 'u', lingual: 'w', occlusal: 'c', mesial: mesialRight ? 'r' : 'l', distal: mesialRight ? 'l' : 'r' };
    const stateOf = (k: CubeSurface): 'caries' | 'fill' | 'none' => (t.fillingSurfaces.has(k) ? 'fill' : t.caries.has('caries-' + k) ? 'caries' : 'none');
    return (Object.keys(area) as CubeSurface[]).map((key) => ({ key, area: area[key], state: stateOf(key) }));
  });
}
