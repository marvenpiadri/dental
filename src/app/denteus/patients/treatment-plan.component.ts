import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { ProcedureId, TreatmentItem } from '../models/dental.models';
import { DEFAULT_PRICE, PROCEDURES, parsePrice, planTotals } from './treatment-rules';
import { UPPER, LOWER } from './tooth-chart.component';

export const PROCEDURE_KEY: Record<ProcedureId, Key> = {
  filling: 'proc.filling', cleaning: 'proc.cleaning', extraction: 'proc.extraction', 'root-canal': 'proc.rootCanal',
  crown: 'proc.crown', implant: 'proc.implant', xray: 'proc.xray', other: 'proc.other',
};

/** The patient's treatment plan: add work (optionally on a tooth), mark it done, see what is left to pay. */
@Component({
  selector: 'den-treatment-plan',
  templateUrl: './treatment-plan.component.html',
  styleUrl: './treatment-plan.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreatmentPlanComponent {
  readonly plan = input<TreatmentItem[]>([]);
  /** A tooth picked in the chart: preselected in the add form. */
  readonly tooth = input<string | null>(null);
  readonly edit = output<(plan: TreatmentItem[]) => TreatmentItem[]>();

  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly procedures = PROCEDURES;
  protected readonly key = PROCEDURE_KEY;
  protected readonly teeth = [...UPPER, ...LOWER].sort((a, b) => +a - +b);

  protected readonly draftTooth = signal('');
  protected readonly draftProcedure = signal<ProcedureId>('filling');
  protected readonly draftPrice = signal(String(DEFAULT_PRICE.filling));
  protected readonly priceInvalid = signal(false);

  protected readonly totals = computed(() => planTotals(this.plan()));
  protected readonly sorted = computed(() =>
    [...this.plan()].sort((a, b) => (a.status === b.status ? +(a.tooth ?? 99) - +(b.tooth ?? 99) : a.status === 'planned' ? -1 : 1)));

  constructor() {
    effect(() => {
      const tooth = this.tooth();
      if (tooth) untracked(() => this.draftTooth.set(tooth));
    });
  }

  protected setProcedure(id: ProcedureId): void {
    this.draftProcedure.set(id);
    this.draftPrice.set(String(DEFAULT_PRICE[id]));
    this.priceInvalid.set(false);
  }

  protected add(): void {
    const price = parsePrice(this.draftPrice());
    if (price === null) { this.priceInvalid.set(true); return; }
    const item: TreatmentItem = { id: crypto.randomUUID(), procedure: this.draftProcedure(), price, status: 'planned' };
    if (this.draftTooth()) item.tooth = this.draftTooth();
    this.edit.emit((plan) => [...plan, item]);
    this.priceInvalid.set(false);
  }

  protected toggle(item: TreatmentItem): void {
    const done = item.status === 'planned';
    this.edit.emit((plan) => plan.map((i) => (i.id === item.id ? { ...i, status: done ? 'done' : 'planned', doneAt: done ? new Date().toISOString() : undefined } : i)));
  }

  protected remove(item: TreatmentItem): void {
    this.edit.emit((plan) => plan.filter((i) => i.id !== item.id));
  }
}
