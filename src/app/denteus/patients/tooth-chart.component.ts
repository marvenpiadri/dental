import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { TOOTH_CONDITIONS, ToothCondition } from '../models/dental.models';
import { CHILD_LOWER, CHILD_UPPER, SURFACES, Surface, toggleSurface } from './surface-rules';

/** Adult teeth in FDI notation, as the dentist faces the patient: upper right to upper left, lower right to lower left. */
export const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].map(String);
export const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38].map(String);

// shortcut: baby teeth are numbered buttons without artwork, and faces are listed by letter, not drawn on the tooth
const KEY: Record<ToothCondition, Key> = {
  caries: 'tooth.caries',
  filled: 'tooth.filled',
  'root-canal': 'tooth.rootCanal',
  crown: 'tooth.crown',
  implant: 'tooth.implant',
  missing: 'tooth.missing',
};

/** Tooth chart: click a tooth, then record its condition. Emits changes; the parent stores them. */
@Component({
  selector: 'den-tooth-chart',
  templateUrl: './tooth-chart.component.html',
  styleUrl: './tooth-chart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToothChartComponent {
  readonly teeth = input<Record<string, ToothCondition>>({});
  readonly surfaces = input<Record<string, string[]>>({});
  readonly planTooth = output<string>();
  readonly markSurfaces = output<{ tooth: string; surfaces: string[] }>();
  readonly mark = output<{ tooth: string; condition: ToothCondition | null }>();

  protected readonly t = inject(I18n).t;
  protected readonly baby = signal(false);
  protected readonly upper = computed(() => (this.baby() ? CHILD_UPPER : UPPER));
  protected readonly lower = computed(() => (this.baby() ? CHILD_LOWER : LOWER));
  protected readonly faces = SURFACES;
  protected readonly faceKey: Record<Surface, Key> = { M: 'tooth.face.M', O: 'tooth.face.O', D: 'tooth.face.D', B: 'tooth.face.B', L: 'tooth.face.L' };
  protected readonly conditions = TOOTH_CONDITIONS;
  protected readonly key = KEY;
  protected readonly selected = signal<string | null>(null);
  protected readonly selectedCondition = computed(() => this.teeth()[this.selected() ?? ''] ?? null);
  protected readonly summary = computed(() => Object.entries(this.teeth()).sort(([a], [b]) => +a - +b));

  /** The artwork has two shapes per position (upper right, lower left, roots up); the other quadrants mirror them. */
  protected shape(tooth: string): { id: string; mirror: boolean; flip: boolean } {
    const quadrant = +tooth[0];
    return { id: `t${quadrant % 2 ? tooth : `${quadrant === 2 ? 1 : 3}${tooth[1]}`}`, mirror: quadrant === 2 || quadrant === 4, flip: quadrant > 2 };
  }

  /** Faces are recorded for caries and fillings, the two findings that sit on one or more faces. */
  protected readonly canMarkFaces = computed(() => ['caries', 'filled'].includes(this.selectedCondition() ?? ''));
  protected readonly selectedFaces = computed(() => this.surfaces()[this.selected() ?? ''] ?? []);
  protected faceSummary = (tooth: string): string => (this.surfaces()[tooth] ?? []).join('');

  protected toggleFace(face: Surface): void {
    const tooth = this.selected();
    if (tooth) this.markSurfaces.emit({ tooth, surfaces: toggleSurface(this.selectedFaces(), face) });
  }

  protected pick(tooth: string): void {
    this.selected.update((current) => (current === tooth ? null : tooth));
  }

  protected plan(): void {
    const tooth = this.selected();
    if (tooth) this.planTooth.emit(tooth);
  }

  protected set(condition: ToothCondition | null): void {
    const tooth = this.selected();
    if (tooth) this.mark.emit({ tooth, condition });
  }
}
