import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { TOOTH_CONDITIONS, ToothCondition } from '../models/dental.models';

/** Adult teeth in FDI notation, as the dentist faces the patient: upper right to upper left, lower right to lower left. */
export const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].map(String);
export const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38].map(String);

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
  readonly planTooth = output<string>();
  readonly mark = output<{ tooth: string; condition: ToothCondition | null }>();

  protected readonly t = inject(I18n).t;
  protected readonly upper = UPPER;
  protected readonly lower = LOWER;
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
