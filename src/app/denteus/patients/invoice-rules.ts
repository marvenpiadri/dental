import { Invoice, InvoiceLine, Payment, TreatmentItem } from '../models/dental.models';

/** Payments that count: a voided payment stays in the history but is in no total. */
export const activePayments = (payments: readonly Payment[]): Payment[] => payments.filter((p) => !p.voidedAt);

/** Money is summed in cents so 0.1 + 0.2 prints as 0.3, not 0.30000000000000004. */
const money = (n: number): number => Math.round(n * 100) / 100;

/** `FA-2026-0007`. Numbers are per kind and year, never reused (cancelled invoices keep theirs), so scanning every patient's invoices is enough. */
export function nextNumber(kind: Invoice['kind'], year: number, all: readonly Invoice[]): string {
  const prefix = `${kind === 'invoice' ? 'FA' : 'AV'}-${year}-`;
  const last = all.filter((i) => i.number.startsWith(prefix)).reduce((n, i) => Math.max(n, Number(i.number.slice(prefix.length)) || 0), 0);
  return prefix + String(last + 1).padStart(4, '0');
}

/** An invoice that still stands: not cancelled, and not itself a credit note. */
export const standing = (i: Invoice): boolean => i.kind === 'invoice' && !i.cancelledAt;

/** Done acts no standing invoice covers yet, so the same act is never billed twice. */
export function uninvoiced(plan: readonly TreatmentItem[], invoices: readonly Invoice[]): TreatmentItem[] {
  const covered = new Set(invoices.filter(standing).flatMap((i) => i.lines.map((l) => l.itemId)));
  return plan.filter((i) => i.status === 'done' && i.price > 0 && !covered.has(i.id));
}

export function issueInvoice(items: readonly TreatmentItem[], label: (i: TreatmentItem) => InvoiceLine, all: readonly Invoice[], now: Date): Invoice | null {
  if (!items.length) return null;
  const lines = items.map(label);
  return { id: crypto.randomUUID(), number: nextNumber('invoice', now.getFullYear(), all), kind: 'invoice', issuedAt: now.toISOString(), lines, total: money(lines.reduce((n, l) => n + l.price, 0)) };
}

/** Cancelling never edits the invoice's lines: it marks it and issues a credit note for the same amount. A reason is required. */
export function cancelInvoice(invoice: Invoice, reason: string, all: readonly Invoice[], now: Date): { marked: Invoice; creditNote: Invoice } | null {
  const why = reason.trim();
  if (!why || !standing(invoice)) return null;
  const marked = { ...invoice, cancelledAt: now.toISOString(), cancelReason: why };
  const creditNote: Invoice = {
    id: crypto.randomUUID(), number: nextNumber('credit-note', now.getFullYear(), all), kind: 'credit-note', issuedAt: now.toISOString(),
    lines: invoice.lines.map((l) => ({ ...l, price: -l.price })), total: -invoice.total, cancelsId: invoice.id,
  };
  return { marked, creditNote };
}

export type InvoiceState = 'unpaid' | 'partial' | 'paid' | 'cancelled';

/** What was paid against one invoice and what is left. Advances (no invoice) are not counted here. */
export function invoiceState(invoice: Invoice, payments: readonly Payment[]): { paid: number; remaining: number; state: InvoiceState } {
  if (invoice.cancelledAt) return { paid: 0, remaining: 0, state: 'cancelled' };
  const paid = money(activePayments(payments).filter((p) => p.invoiceId === invoice.id).reduce((n, p) => n + p.amount, 0));
  const remaining = Math.max(0, money(invoice.total - paid));
  return { paid, remaining, state: paid <= 0 ? 'unpaid' : remaining > 0 ? 'partial' : 'paid' };
}

/** Voids a payment with a reason; the record stays. Returns null when there is no reason or it was already voided. */
export function voidPayment(payment: Payment, reason: string, now: Date): Payment | null {
  const why = reason.trim();
  return why && !payment.voidedAt ? { ...payment, voidedAt: now.toISOString(), voidReason: why } : null;
}
