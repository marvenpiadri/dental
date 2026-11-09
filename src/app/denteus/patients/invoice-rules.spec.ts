import { Invoice, Payment, TreatmentItem } from '../models/dental.models';
import { activePayments, cancelInvoice, invoiceState, issueInvoice, nextNumber, uninvoiced, voidPayment } from './invoice-rules';
import { balance } from './treatment-rules';

const item = (id: string, price: number, status: TreatmentItem['status'] = 'done'): TreatmentItem => ({ id, procedure: 'filling', price, status });
const label = (i: TreatmentItem) => ({ itemId: i.id, label: i.procedure, price: i.price });
const pay = (id: string, amount: number, extra: Partial<Payment> = {}): Payment => ({ id, amount, method: 'cash', at: '2026-11-06T10:00:00.000Z', ...extra });
const now = new Date(2026, 10, 6);

describe('invoices and offline payments', () => {
  it('numbers invoices and credit notes without gaps, per kind and year', () => {
    expect(nextNumber('invoice', 2026, [])).toBe('FA-2026-0001');
    const a = issueInvoice([item('1', 500)], label, [], now)!;
    expect(a.number).toBe('FA-2026-0001');
    expect(nextNumber('invoice', 2026, [a])).toBe('FA-2026-0002');
    expect(nextNumber('invoice', 2027, [a])).toBe('FA-2027-0001');
    expect(nextNumber('credit-note', 2026, [a])).toBe('AV-2026-0001');
  });

  it('invoices only done acts that no standing invoice covers', () => {
    const plan = [item('1', 500), item('2', 300), item('3', 900, 'planned'), item('4', 0)];
    expect(uninvoiced(plan, []).map((i) => i.id)).toEqual(['1', '2']);
    const inv = issueInvoice([plan[0]], label, [], now)!;
    expect(uninvoiced(plan, [inv]).map((i) => i.id)).toEqual(['2']);
    expect(issueInvoice([], label, [], now)).toBeNull();
  });

  it('tracks partial and full payment against one invoice; advances are separate', () => {
    const inv = issueInvoice([item('1', 500)], label, [], now)!;
    expect(invoiceState(inv, []).state).toBe('unpaid');
    const part = [pay('a', 200, { invoiceId: inv.id }), pay('adv', 999)];
    expect(invoiceState(inv, part)).toEqual({ paid: 200, remaining: 300, state: 'partial' });
    expect(invoiceState(inv, [...part, pay('b', 300, { invoiceId: inv.id })]).state).toBe('paid');
  });

  it('cancelling needs a reason, keeps the original lines and issues a credit note', () => {
    const inv = issueInvoice([item('1', 500)], label, [], now)!;
    expect(cancelInvoice(inv, '  ', [inv], now)).toBeNull();
    const { marked, creditNote } = cancelInvoice(inv, 'wrong patient', [inv], now)!;
    expect(marked.lines).toEqual(inv.lines);
    expect(marked.cancelReason).toBe('wrong patient');
    expect([creditNote.number, creditNote.total, creditNote.cancelsId]).toEqual(['AV-2026-0001', -500, inv.id]);
    expect(invoiceState(marked, []).state).toBe('cancelled');
    expect(cancelInvoice(marked, 'again', [marked, creditNote], now)).toBeNull();
    expect(uninvoiced([item('1', 500)], [marked, creditNote]).length).toBe(1); // the act can be invoiced again
  });

  it('voiding keeps the payment but removes it from balances', () => {
    const p = pay('a', 500);
    expect(voidPayment(p, '', now)).toBeNull();
    const v = voidPayment(p, 'entered twice', now)!;
    expect(v.amount).toBe(500);
    expect(activePayments([v])).toEqual([]);
    expect(balance([item('1', 800)], [v, pay('b', 100)])).toEqual({ charged: 800, paid: 100, due: 700 });
    expect(voidPayment(v, 'again', now)).toBeNull();
  });
});

import { invoiceHtml } from './invoice-html';
describe('invoice legal footer', () => {
  it('prints the clinic details, escaped, and skips empty lines', () => {
    const html = invoiceHtml({ clinic: 'C', patient: 'P', number: 'FA-2026-0001', date: 'd', title: 'Invoice', lang: 'en', lines: [], total: '0', paid: '0', remaining: '0', legal: ['Atlas <SARL>', '', 'ICE: 1'],
      labels: { patient: 'p', date: 'd', where: 'w', act: 'a', price: 'p', total: 't', paid: 'p', remaining: 'r' } });
    expect(html).toContain('Atlas &lt;SARL&gt;');
    expect(html.match(/<section class="notes">[\s\S]*?<\/section>/)![0].match(/<p>/g)).toHaveLength(2);
  });
});

describe('invoice rules: clinic-wide and edge cases', () => {
  it('never reuses a number across patients, even after a cancellation', () => {
    const a = issueInvoice([item('a', 100)], label, [], now)!;
    const b = issueInvoice([item('b', 50)], label, [a], now)!; // a second patient: all invoices are passed in
    expect([a.number, b.number]).toEqual(['FA-2026-0001', 'FA-2026-0002']);
    const { creditNote } = cancelInvoice(a, 'Wrong patient', [a, b], now)!;
    expect(creditNote.number).toBe('AV-2026-0001');
    expect(issueInvoice([item('c', 10)], label, [a, b, creditNote], now)!.number).toBe('FA-2026-0003');
  });
  it('adds decimals without float noise', () => {
    const inv = issueInvoice([item('a', 0.1), item('b', 0.2)], label, [], now)!;
    expect(inv.total).toBe(0.3);
    expect(invoiceState(inv, [pay('p', 0.1, { invoiceId: inv.id }), pay('q', 0.2, { invoiceId: inv.id })])).toEqual({ paid: 0.3, remaining: 0, state: 'paid' });
  });
  it('points the credit note at its invoice, with negated lines, and cannot be cancelled again', () => {
    const inv = issueInvoice([item('a', 100)], label, [], now)!;
    const { marked, creditNote } = cancelInvoice(inv, 'Error', [inv], now)!;
    expect(creditNote).toMatchObject({ cancelsId: inv.id, total: -100, kind: 'credit-note' });
    expect(creditNote.lines[0].price).toBe(-100);
    expect(cancelInvoice(marked, 'Again', [marked, creditNote], now)).toBeNull();
    expect(cancelInvoice(creditNote, 'Nope', [marked, creditNote], now)).toBeNull();
    expect(uninvoiced([item('a', 100)], [marked, creditNote]).length).toBe(1); // billable again after cancellation
  });
  it('refuses a blank reason and a second void', () => {
    expect(voidPayment(pay('p', 5), '   ', now)).toBeNull();
    const v = voidPayment(pay('p', 5), 'Typo', now)!;
    expect(voidPayment(v, 'Again', now)).toBeNull();
  });
});
