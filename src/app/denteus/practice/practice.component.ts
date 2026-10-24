import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { DentalStore } from '../services/dental-store.service';
import { localIsoDay } from '../utils/appointment-labels';
import { LAB_STATUSES, LabOrder, LabStatus, isLate, isLow, monthTotal, wholeNumber } from './practice-rules';
import { PracticeStore } from './practice-store.service';

type Tab = 'expenses' | 'stock' | 'lab';

/** The daily running of the clinic outside the chair: what was spent, what is running out, what is at the lab. */
@Component({
  selector: 'den-practice',
  templateUrl: './practice.component.html',
  styleUrl: './practice.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class PracticeComponent {
  protected readonly practice = inject(PracticeStore);
  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly tabs: Tab[] = ['expenses', 'stock', 'lab'];
  protected readonly tabKey: Record<Tab, Key> = { expenses: 'practice.tab.expenses', stock: 'practice.tab.stock', lab: 'practice.tab.lab' };
  protected readonly statuses = LAB_STATUSES;
  protected readonly statusKey: Record<LabStatus, Key> = { sent: 'practice.lab.status.sent', ready: 'practice.lab.status.ready', fitted: 'practice.lab.status.fitted' };
  protected readonly tab = signal<Tab>('expenses');
  protected readonly invalid = signal(false);
  /** Set in the browser only: the server doesn't know the visitor's day. */
  protected readonly today = signal('');

  protected readonly monthSpent = computed(() => this.today() ? monthTotal(this.practice.expenses(), this.today().slice(0, 7)) : 0);
  protected readonly newestFirst = computed(() => [...this.practice.expenses()].sort((a, b) => b.day.localeCompare(a.day)));
  protected readonly lowCount = computed(() => this.practice.stock().filter(isLow).length);
  protected readonly orders = computed(() => [...this.practice.lab()].sort((a, b) => a.due.localeCompare(b.due)));

  constructor() {
    afterNextRender(() => {
      this.today.set(localIsoDay(new Date()));
      void this.practice.init();
    });
  }

  protected isLow = isLow;
  protected late = (o: LabOrder): boolean => isLate(o, this.today());
  protected patientName = (id: string): string => this.store.patientMap().get(id)?.fullName ?? '—';

  protected addExpense(label: string, amount: string): void {
    const value = wholeNumber(amount);
    if (!label.trim() || value <= 0) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.changeExpenses((list) => [...list, { id: crypto.randomUUID(), day: this.today(), label: label.trim(), amount: value }]);
  }

  protected addStock(name: string, qty: string, min: string): void {
    if (!name.trim()) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.changeStock((list) => [...list, { id: crypto.randomUUID(), name: name.trim(), qty: wholeNumber(qty), min: wholeNumber(min) }]);
  }

  protected nudge(id: string, by: number): void {
    this.practice.changeStock((list) => list.map((s) => (s.id === id ? { ...s, qty: Math.max(0, s.qty + by) } : s)));
  }

  protected addOrder(patientId: string, work: string, lab: string, due: string): void {
    if (!patientId || !work.trim()) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.changeLab((list) => [...list, { id: crypto.randomUUID(), patientId, work: work.trim(), lab: lab.trim(), due, status: 'sent' }]);
  }

  protected setStatus(id: string, status: string): void {
    this.practice.changeLab((list) => list.map((o) => (o.id === id ? { ...o, status: status as LabStatus } : o)));
  }
}
