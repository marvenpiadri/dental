import { AuthService } from '../../core/auth/auth.service';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { Invoice, PAYMENT_METHODS, Payment, PaymentMethod, TreatmentItem } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { Documents } from '../documents/documents.service';
import { statementHtml } from './statement-html';
import { receiptHtml } from './receipt-html';
import { balance, parsePrice, procedureName } from './treatment-rules';
import { scopeText } from './procedure-record';
import { InvoiceState, cancelInvoice, invoiceState, issueInvoice, uninvoiced, voidPayment } from './invoice-rules';
import { invoiceHtml } from './invoice-html';

const STATE_KEY: Record<InvoiceState, Key> = { unpaid: 'inv.state.unpaid', partial: 'inv.state.partial', paid: 'inv.state.paid', cancelled: 'inv.state.cancelled' };
const METHOD_KEY: Record<PaymentMethod, Key> = { cash: 'pay.cash', card: 'pay.card', transfer: 'pay.transfer', cheque: 'pay.cheque', other: 'pay.other' };

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
  readonly invoices = input<Invoice[]>([]);
  readonly edit = output<(payments: Payment[]) => Payment[]>();
  readonly editInvoices = output<(invoices: Invoice[]) => Invoice[]>();

  protected readonly i18n = inject(I18n);
  private readonly docs = inject(Documents);
  private readonly store = inject(DentalStore);
  private readonly auth = inject(AuthService);
  protected readonly t = this.i18n.t;
  protected readonly methods = computed(() => PAYMENT_METHODS.filter((m) => this.store.prefs().payMethods.includes(m)));
  protected readonly methodKey = METHOD_KEY;
  protected readonly stateKey = STATE_KEY;

  protected readonly amount = signal('');
  protected readonly method = signal<PaymentMethod>('cash');
  /** The chosen method, or the first enabled one when the clinic has since turned the chosen one off. */
  protected readonly chosen = computed(() => (this.methods().includes(this.method()) ? this.method() : this.methods()[0]));
  protected readonly invalid = signal(false);
  protected readonly reference = signal('');
  protected readonly forInvoice = signal('');
  /** The payment or invoice waiting for a reason before it is voided or cancelled. */
  protected readonly asking = signal<{ kind: 'payment' | 'invoice'; id: string } | null>(null);
  protected readonly reason = signal('');
  protected readonly toBill = computed(() => uninvoiced(this.plan(), this.invoices()));
  protected readonly toBillTotal = computed(() => this.toBill().reduce((n, i) => n + i.price, 0));
  protected readonly rows = computed(() => [...this.invoices()].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map((inv) => ({ inv, ...invoiceState(inv, this.payments()) })));
  protected readonly open = computed(() => this.rows().filter((r) => r.state === 'unpaid' || r.state === 'partial'));

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
    const payment: Payment = { id: crypto.randomUUID(), amount: value, method: this.chosen(), at: new Date().toISOString() };
    if (this.reference().trim()) payment.reference = this.reference().trim();
    if (this.forInvoice()) payment.invoiceId = this.forInvoice();
    this.edit.emit((list) => [...list, payment]);
    this.amount.set('');
    this.reference.set('');
    this.forInvoice.set('');
    this.invalid.set(false);
  }

  /** Picking an invoice offers what is left on it. */
  protected pickInvoice(id: string): void {
    this.forInvoice.set(id);
    const left = this.open().find((r) => r.inv.id === id)?.remaining;
    if (left && !this.amount()) this.amount.set(String(left));
  }

  protected readonly canVoid = computed(() => this.auth.can('billing.void'));
  protected ask(kind: 'payment' | 'invoice', id: string): void { if (!this.canVoid()) return; this.reason.set(''); this.asking.set({ kind, id }); }

  /** Voiding keeps the payment in the history; cancelling an invoice issues a credit note. Both need a reason. */
  protected confirm(): void {
    const a = this.asking();
    if (!a || !this.reason().trim() || !this.canVoid()) return;
    const now = new Date();
    if (a.kind === 'payment') {
      this.edit.emit((list) => list.map((p) => (p.id === a.id ? voidPayment(p, this.reason(), now) ?? p : p)));
    } else {
      const inv = this.invoices().find((i) => i.id === a.id);
      const all = this.store.patients().flatMap((p) => p.invoices ?? []);
      const done = inv && cancelInvoice(inv, this.reason(), all, now);
      if (done) this.editInvoices.emit((list) => [...list.map((i) => (i.id === a.id ? done.marked : i)), done.creditNote]);
    }
    this.asking.set(null);
  }

  protected issue(): void {
    const t = this.t;
    const all = this.store.patients().flatMap((p) => p.invoices ?? []);
    const inv = issueInvoice(this.toBill(), (i) => ({ itemId: i.id, label: procedureName(t, i.procedure, i.name), where: i.tooth ?? (i.scope ? scopeText(i, t) : ''), price: i.price }), all, new Date());
    if (inv) this.editInvoices.emit((list) => [...list, inv]);
  }

  private legal(): string[] {
    const c = this.store.locations()[0];
    return c ? [c.legalName ?? '', c.taxId ? `${this.t('set.taxId')}: ${c.taxId}` : '', c.bank ? `${this.t('set.bank')}: ${c.bank}` : '', c.address ?? '', c.phone ?? '', c.invoiceNote ?? ''] : [];
  }

  protected printInvoice(inv: Invoice): void {
    const t = this.t;
    const st = invoiceState(inv, this.payments());
    const orig = inv.cancelsId ? this.invoices().find((i) => i.id === inv.cancelsId) : undefined;
    const tpl = this.docs.templateFor('invoice');
    const html = invoiceHtml({
      clinic: this.store.locations()[0]?.name ?? 'Dontalist', patient: this.patientName(), number: inv.number, title: t(inv.kind === 'invoice' ? 'inv.invoice' : 'inv.creditNote'),
      cancels: orig ? t('inv.cancelsOf', { number: orig.number }) : undefined,
      date: this.i18n.date(new Date(inv.issuedAt), { day: 'numeric', month: 'long', year: 'numeric' }), lang: this.i18n.lang(),
      lines: inv.lines.map((l) => ({ where: l.where ?? '', name: l.label, price: this.i18n.money(l.price) })),
      total: this.i18n.money(inv.total), paid: this.i18n.money(st.paid), remaining: this.i18n.money(st.remaining),
      legal: this.legal(),
      labels: { patient: t('receipt.patient'), date: t('receipt.date'), where: t('plan.tooth'), act: t('plan.procedure'), price: t('plan.price'), total: t('inv.total'), paid: t('bill.paid'), remaining: t('bill.due') },
    }, tpl);
    this.docs.print(html);
  }

  protected readonly doneLines = computed(() => this.plan().filter((i) => i.status === 'done'));

  /** Care actually done and its fees, for the patient to send to their insurer. Planned work never appears. */
  protected printStatement(): void {
    const done = [...this.doneLines()].sort((a, b) => (a.doneAt ?? '').localeCompare(b.doneAt ?? ''));
    if (!done.length) return;
    const t = this.t;
    const day = (iso?: string) => (iso ? this.i18n.date(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    const tpl = this.docs.templateFor('statement');
    const html = statementHtml({
      clinic: this.store.locations()[0]?.name ?? 'Dontalist', patient: this.patientName(), insurer: this.insurer(), number: this.insuranceNumber(),
      date: day(new Date().toISOString()), lang: this.i18n.lang(), total: this.i18n.money(this.sums().charged),
      lines: done.map((i) => ({ date: day(i.doneAt), tooth: i.tooth ?? (i.scope ? scopeText(i, t) : ''), name: procedureName(t, i.procedure, i.name), price: this.i18n.money(i.price) })),
      labels: { title: t('stmt.title'), patient: t('receipt.patient'), insurer: t('stmt.insurer'), number: t('stmt.number'), date: t('receipt.date'), tooth: t('plan.tooth'), act: t('plan.procedure'), price: t('plan.price'), total: t('quote.total'), note: t('stmt.note') },
    }, tpl);
    this.docs.print(html);
  }

  /** Opens the receipt in a new window and prints it. A blocked pop-up simply does nothing: the browser shows its own notice. */
  protected print(payment: Payment): void {
    const t = this.t;
    const sums = this.sums();
    const tpl = this.docs.templateFor('receipt');
    const html = receiptHtml({
      clinic: this.store.locations()[0]?.name ?? 'Dontalist',
      patient: this.patientName(),
      number: payment.id.slice(0, 8).toUpperCase(),
      reference: payment.reference,
      date: this.when(payment.at),
      method: t(METHOD_KEY[payment.method]),
      amount: this.i18n.money(payment.amount),
      charged: this.i18n.money(sums.charged),
      paid: this.i18n.money(sums.paid),
      due: this.i18n.money(Math.max(0, sums.due)),
      labels: { reference: t('bill.reference'), title: t('receipt.title'), patient: t('receipt.patient'), date: t('receipt.date'), method: t('bill.method'), amount: t('receipt.amount'), charged: t('bill.charged'), paid: t('bill.paid'), due: t('bill.due'), thanks: t('receipt.thanks') },
      lang: this.i18n.lang(),
      dir: 'ltr', // shortcut: receipts are left-to-right until an RTL language is added
    }, tpl);
    this.docs.print(html);
  }

  protected when(at: string): string {
    return this.i18n.date(new Date(at), { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
