import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { DentalStore } from '../services/dental-store.service';
import { PROCEDURE_CHART } from '../patients/procedure-chart';
import { SCOPES, SCOPE_KEY, buildProcedures, teethOfScope, type ProcedureScope } from '../patients/procedure-record';
import { parsePrice, procedureName } from '../patients/treatment-rules';
import { makeExamination } from './engine/exam';
import { writeChart, type Chart } from './engine/chart';
import { editChart } from './engine/plan';

/**
 * The procedure row of the chart workspace: what was done or is planned, on which teeth, at what price.
 * Every screen writes the same TreatmentItem records through the store; this is the chart's way in.
 */
@Component({
  selector: 'den-procedure-panel',
  templateUrl: './procedure-panel.component.html',
  styleUrl: './procedure-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedurePanelComponent {
  readonly patientId = input.required<string>();
  /** The working chart: saved together with the procedure so what was drawn and what was recorded stay in step. */
  readonly chart = input.required<Chart>();
  readonly teeth = input.required<readonly number[]>();
  /** Asks the chart to highlight these teeth (a quadrant, an arch, the mouth). */
  readonly highlight = output<readonly number[]>();
  readonly closed = output<void>();

  protected readonly t = inject(I18n).t;
  private readonly store = inject(DentalStore);
  protected readonly catalog = this.store.catalog;
  protected readonly scopes = SCOPES;
  protected readonly nameOf = (id: string, name?: string) => procedureName(this.t, id, name);
  protected scopeName(s: ProcedureScope) { return this.t(SCOPE_KEY[s]); }

  protected readonly date = signal(new Date().toISOString().slice(0, 10));
  protected readonly procedure = signal('');
  protected readonly price = signal('');
  protected readonly done = signal(false); // a new procedure is planned until the dentist says it was performed
  protected readonly scope = signal<ProcedureScope>('teeth');
  protected readonly quadrant = signal<1 | 2 | 3 | 4>(1);
  protected readonly draw = signal(true);
  protected readonly invalid = signal(false);
  protected readonly drawable = computed(() => PROCEDURE_CHART[this.procedure()] ?? null);
  protected readonly perTooth = computed(() => this.scope() === 'teeth');
  protected readonly summary = computed(() => (this.scope() === 'teeth' ? (this.teeth().length ? this.t('procedure.teeth', { n: this.teeth().length, list: this.teeth().join(', ') }) : this.t('procedure.hint')) : this.t(SCOPE_KEY[this.scope()])));

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
  protected setScope(s: ProcedureScope): void { this.scope.set(s); this.highlight.emit(teethOfScope(s, this.quadrant())); }
  protected setQuadrant(q: number): void { this.quadrant.set(q as 1 | 2 | 3 | 4); this.highlight.emit(teethOfScope('quadrant', q)); }

  protected save(): void {
    const entry = this.catalog().find((e) => e.id === this.procedure());
    const price = parsePrice(this.price());
    const teeth = this.scope() === 'teeth' ? this.teeth() : [];
    if (!entry || price === null || !/^\d{4}-\d{2}-\d{2}$/.test(this.date()) || (this.scope() === 'teeth' && !teeth.length)) { this.invalid.set(true); return; }
    const name = this.nameOf(entry.id, entry.name);
    const items = buildProcedures({ procedure: entry.id, name, price, done: this.done(), date: this.date(), scope: this.scope(), quadrant: this.quadrant(), teeth }, () => crypto.randomUUID());
    const id = this.patientId();
    this.store.changePlan(id, (plan) => [...plan, ...items]);
    let chart = this.chart();
    const edit = this.drawable();
    if (edit && this.draw() && teeth.length) { // done work shows as a finding on its teeth, planned work in the plan layer
      const out = editChart(chart, this.done() ? 'status' : 'plan', teeth, edit, { confirmed: true });
      if (out.kind !== 'confirm' && out.changed.length) chart = out.chart;
    }
    this.store.setOdontogram(id, writeChart(chart));
    this.store.addExamination(id, makeExamination(id, chart, { id: crypto.randomUUID(), date: this.date(), note: name }));
    this.closed.emit();
  }
}
