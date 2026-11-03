import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import type { ToothRecord } from './engine/chart';
import { DentalStore } from '../services/dental-store.service';
import { SurfaceCubeComponent, type CubeSurface } from './surface-cube.component';
import { ToothSnap } from './tooth-snap.service';

/** A tooth's crown from the biting side, as a 3D picture cut into its five surfaces with visible borders; a click names the surface. Falls back to the flat drawing without 3D. */
@Component({
  selector: 'den-crown-top',
  imports: [SurfaceCubeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src(); as s) {
      <img [src]="s" alt="" draggable="false" [class.ro]="readonly()" (click)="click($event)" />
    } @else {
      <den-surface-cube [no]="no()" [state]="state()" [readonly]="readonly()" [marked]="marked()" (pick)="pick.emit($event)" />
    }
  `,
  styles: `
    :host { display: block; width: 100%; max-width: var(--crown-top, 52px); margin-inline: auto; aspect-ratio: 1; }
    img { width: 100%; height: 100%; display: block; cursor: pointer; object-fit: contain; }
    img.ro { cursor: default; }
  `,
})
export class CrownTopComponent {
  readonly no = input.required<number>();
  readonly state = input.required<ToothRecord>();
  readonly readonly = input(false);
  /** Surfaces picked in the 3D view: lit green on the picture. */
  readonly marked = input<readonly string[]>([]);
  readonly pick = output<CubeSurface>();

  private readonly snap = inject(ToothSnap);
  private readonly store = inject(DentalStore);
  private readonly url = signal<string | null>(null);
  protected readonly src = computed(() => (this.store.view3d() ? this.url() : null));

  constructor() {
    effect(() => {
      if (!this.store.view3d()) return;
      const no = this.no(), st = this.state(), mk = this.marked();
      void this.snap.snap(no, st, false, true, mk).then((u) => { if (no === this.no()) this.url.set(u); });
    });
  }

  protected click(e: MouseEvent): void {
    if (this.readonly()) return;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    void this.snap.surfaceAt(this.no(), this.state(), false, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height).then((id) => { if (id) this.pick.emit(id as CubeSurface); });
  }
}
