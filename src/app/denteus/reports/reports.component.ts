import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { PAYMENT_METHODS, PaymentMethod } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { Period, buildReport } from './report-rules';

const PERIOD_KEY: Record<Period, Key> = { month: 'reports.month', '30d': 'reports.30d', year: 'reports.year' };
const METHOD_KEY: Record<PaymentMethod, Key> = { cash: 'pay.cash', card: 'pay.card', transfer: 'pay.transfer' };

/** How the clinic is doing: money received, visits kept and missed, and who did the work. */
@Component({
  selector: 'den-reports',
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class ReportsComponent {
  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly periods = Object.keys(PERIOD_KEY) as Period[];
  protected readonly periodKey = PERIOD_KEY;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodKey = METHOD_KEY;

  protected readonly period = signal<Period>('month');
  /** Set in the browser only: the server's clock and time zone are not the clinic's. */
  private readonly now = signal<Date | null>(null);

  constructor() {
    afterNextRender(() => this.now.set(new Date()));
  }

  protected readonly report = computed(() => {
    const now = this.now();
    if (!now || !this.store.loaded()) return null;
    return buildReport({ patients: this.store.patients(), appointments: this.store.appointments(), dentists: this.store.dentists() }, this.period(), now);
  });

  protected readonly peak = computed(() => Math.max(1, ...(this.report()?.series.map((b) => b.amount) ?? [])));
  protected readonly mostVisits = computed(() => Math.max(1, ...(this.report()?.byDentist.map((d) => d.completed) ?? [])));

  protected label(at: Date): string {
    return this.i18n.date(at, this.period() === 'year' ? { month: 'short' } : { day: 'numeric', month: 'short' });
  }

  protected percent(rate: number | null): string {
    return rate === null ? '—' : `${Math.round(rate * 100)}%`;
  }
}
