import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { TreatmentItem } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { parsePrice, planTotals, procedureName } from './treatment-rules';
import { UPPER, LOWER } from './tooth-chart.component';

/** The patient's treatment plan: add work (optionally on a tooth), mark it done, see what is left to pay. */
@Component({
  selector: 'den-treatment-plan',
  imports: [RouterLink],
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
  protected readonly catalog = inject(DentalStore).catalog;
  protected readonly nameOf = (id: string, name?: string) => procedureName(this.t, id, name);
  protected readonly teeth = [...UPPER, ...LOWER].sort((a, b) => +a - +b);

  protected readonly draftTooth = signal('');
  protected readonly draftProcedure = signal('');
  protected readonly draftPrice = signal('');
  protected readonly priceInvalid = signal(false);

  protected readonly totals = computed(() => planTotals(this.plan()));
  protected readonly sorted = computed(() =>
    [...this.plan()].sort((a, b) => (a.status === b.status ? +(a.tooth ?? 99) - +(b.tooth ?? 99) : a.status === 'planned' ? -1 : 1)));

  constructor() {
    // preselect the first act once the catalog has loaded
    effect(() => {
      const first = this.catalog()[0];
      if (first && !this.draftProcedure()) untracked(() => this.setProcedure(first.id));
    });
    effect(() => {
      const tooth = this.tooth();
      if (tooth) untracked(() => this.draftTooth.set(tooth));
    });
  }

  protected setProcedure(id: string): void {
    this.draftProcedure.set(id);
    this.draftPrice.set(String(this.catalog().find((entry) => entry.id === id)?.price ?? ''));
    this.priceInvalid.set(false);
  }

  protected add(): void {
    const price = parsePrice(this.draftPrice());
    if (price === null) { this.priceInvalid.set(true); return; }
    const entry = this.catalog().find((e) => e.id === this.draftProcedure());
    if (!entry) return; // an empty catalog has nothing to add: the form shows a hint
    const item: TreatmentItem = { id: crypto.randomUUID(), procedure: entry.id, name: this.nameOf(entry.id, entry.name), price, status: 'planned' };
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
