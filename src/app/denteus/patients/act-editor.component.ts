import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { Patient, TreatmentItem } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { DentalChartComponent } from '../odontogram/dental-chart.component';
import { newChart, readChart } from '../odontogram/engine/chart';
import { makeExamination } from '../odontogram/engine/exam';
import { parsePrice, procedureName } from './treatment-rules';

/**
 * "Add act": the only place the chart can be edited. Pick the teeth, record their conditions, name the act and save.
 * Chart edits stay in a draft until Save, so Cancel leaves the patient's chart exactly as it was.
 */
@Component({
  selector: 'den-act-editor',
  imports: [DentalChartComponent],
  templateUrl: './act-editor.component.html',
  styleUrl: './act-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActEditorComponent {
  readonly patient = input.required<Patient>();
  readonly closed = output<void>();

  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly store = inject(DentalStore);
  protected readonly catalog = this.store.catalog;
  protected readonly nameOf = (id: string, name?: string) => procedureName(this.t, id, name);

  protected readonly date = signal(new Date().toISOString().slice(0, 10));
  protected readonly procedure = signal('');
  protected readonly price = signal('');
  protected readonly done = signal(true);
  protected readonly teeth = signal<readonly number[]>([]);
  protected readonly draft = signal<unknown>(undefined);
  protected readonly invalid = signal(false);
  protected readonly clinic = computed(() => this.store.locations()[0]?.name ?? '');

  constructor() {
    effect(() => {
      const first = this.catalog()[0];
      if (first && !this.procedure()) untracked(() => this.setProcedure(first.id));
    });
  }

  protected setProcedure(id: string): void {
    this.procedure.set(id);
    this.price.set(String(this.catalog().find((e) => e.id === id)?.price ?? ''));
    this.invalid.set(false);
  }

  protected save(): void {
    const entry = this.catalog().find((e) => e.id === this.procedure());
    const price = parsePrice(this.price());
    if (!entry || price === null || !/^\d{4}-\d{2}-\d{2}$/.test(this.date())) { this.invalid.set(true); return; }
    const name = this.nameOf(entry.id, entry.name);
    const at = new Date(`${this.date()}T12:00:00`).toISOString();
    const make = (tooth?: string): TreatmentItem => ({ id: crypto.randomUUID(), procedure: entry.id, name, price, status: this.done() ? 'done' : 'planned', date: this.date(), ...(tooth ? { tooth } : {}), ...(this.done() ? { doneAt: at } : {}) });
    const items = this.teeth().length ? this.teeth().map((n) => make(String(n))) : [make()];
    const id = this.patient().id;
    this.store.changePlan(id, (plan) => [...plan, ...items]);
    const payload = this.draft() ?? this.patient().odontogram;
    const chart = payload == null ? newChart() : readChart(payload).chart; // an unreadable stored chart is never overwritten or snapshotted
    if (chart) {
      if (this.draft() !== undefined) this.store.setOdontogram(id, this.draft());
      this.store.addExamination(id, makeExamination(id, chart, { id: crypto.randomUUID(), date: this.date(), note: name }));
    }
    this.closed.emit();
  }
}
