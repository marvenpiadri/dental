import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { PAYMENT_METHODS, Payment, PaymentMethod, TreatmentItem } from '../models/dental.models';
import { balance, parsePrice } from './treatment-rules';

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
  readonly edit = output<(payments: Payment[]) => Payment[]>();

  protected readonly i18n = inject(I18n);
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

  protected when(payment: Payment): string {
    return this.i18n.date(new Date(payment.at), { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
