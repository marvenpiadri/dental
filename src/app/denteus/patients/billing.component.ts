import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { PAYMENT_METHODS, Payment, PaymentMethod, TreatmentItem } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { statementHtml } from './statement-html';
import { receiptHtml } from './receipt-html';
import { balance, parsePrice, procedureName } from './treatment-rules';

const METHOD_KEY: Record<PaymentMethod, Key> = { cash: 'pay.cash', card: 'pay.card', transfer: 'pay.transfer' };

/** What the patient owes (done work) against what they have paid. Payments are recorded here; nothing is sent anywhere. */
@Component({
  selector: 'den-billing',
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingComponent {
  readonly plan = input<TreatmentItem[]>([]);
  readonly payments = input<Payment[]>([]);
  /** Name on the receipt. */
  readonly patientName = input('');
  readonly insurer = input('');
  readonly insuranceNumber = input('');
  readonly edit = output<(payments: Payment[]) => Payment[]>();

  protected readonly i18n = inject(I18n);
  private readonly store = inject(DentalStore);
  protected readonly t = this.i18n.t;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodKey = METHOD_KEY;

  protected readonly amount = signal('');
  protected readonly method = signal<PaymentMethod>('cash');
  protected readonly invalid = signal(false);

  protected readonly sums = computed(() => balance(this.plan(), this.payments()));
  protected readonly recent = computed(() => [...this.payments()].sort((a, b) => b.at.localeCompare(a.at)));

  /** One click for the common case at the desk: the patient pays what is left. */
  protected fillDue(): void {
    const due = this.sums().due;
    if (due > 0) this.amount.set(String(due));
  }

  protected add(): void {
    const value = parsePrice(this.amount());
    if (!value) { this.invalid.set(true); return; } // zero is not a payment
    const payment: Payment = { id: crypto.randomUUID(), amount: value, method: this.method(), at: new Date().toISOString() };
    this.edit.emit((list) => [...list, payment]);
    this.amount.set('');
    this.invalid.set(false);
  }

  protected remove(payment: Payment): void {
    this.edit.emit((list) => list.filter((p) => p.id !== payment.id));
  }

  protected readonly doneLines = computed(() => this.plan().filter((i) => i.status === 'done'));

  /** Care actually done and its fees, for the patient to send to their insurer. Planned work never appears. */
  protected printStatement(): void {
    const done = [...this.doneLines()].sort((a, b) => (a.doneAt ?? '').localeCompare(b.doneAt ?? ''));
    if (!done.length) return;
    const t = this.t;
    const day = (iso?: string) => (iso ? this.i18n.date(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    const html = statementHtml({
      clinic: this.store.locations()[0]?.name ?? 'Dentaleus', patient: this.patientName(), insurer: this.insurer(), number: this.insuranceNumber(),
      date: day(new Date().toISOString()), lang: this.i18n.lang(), total: this.i18n.money(this.sums().charged),
      lines: done.map((i) => ({ date: day(i.doneAt), tooth: i.tooth ?? '', name: procedureName(t, i.procedure, i.name), price: this.i18n.money(i.price) })),
      labels: { title: t('stmt.title'), patient: t('receipt.patient'), insurer: t('stmt.insurer'), number: t('stmt.number'), date: t('receipt.date'), tooth: t('plan.tooth'), act: t('plan.procedure'), price: t('plan.price'), total: t('quote.total'), note: t('stmt.note') },
    });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  /** Opens the receipt in a new window and prints it. A blocked pop-up simply does nothing: the browser shows its own notice. */
  protected print(payment: Payment): void {
    const t = this.t;
    const sums = this.sums();
    const html = receiptHtml({
      clinic: this.store.locations()[0]?.name ?? 'Dentaleus',
      patient: this.patientName(),
      number: payment.id.slice(0, 8).toUpperCase(),
      date: this.when(payment),
      method: t(METHOD_KEY[payment.method]),
      amount: this.i18n.money(payment.amount),
      charged: this.i18n.money(sums.charged),
      paid: this.i18n.money(sums.paid),
      due: this.i18n.money(Math.max(0, sums.due)),
      labels: { title: t('receipt.title'), patient: t('receipt.patient'), date: t('receipt.date'), method: t('bill.method'), amount: t('receipt.amount'), charged: t('bill.charged'), paid: t('bill.paid'), due: t('bill.due'), thanks: t('receipt.thanks') },
      lang: this.i18n.lang(),
      dir: 'ltr', // shortcut: receipts are left-to-right until an RTL language is added
    });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  protected when(payment: Payment): string {
    return this.i18n.date(new Date(payment.at), { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
