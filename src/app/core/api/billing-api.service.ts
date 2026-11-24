import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Invoice, Payment, PaymentMethod, Refund } from '../../denteus/models/dental.models';
import { ApiSession } from './api-session.service';

type Dto = Record<string, unknown>;
const money = (n: number): string => n.toFixed(2);
const opt = <K extends string>(k: K, v: unknown): { [P in K]?: string } => (v ? ({ [k]: String(v) } as { [P in K]: string }) : {});

export const toPayment = (r: Dto): Payment => ({
  id: String(r['id']), amount: Number(r['amount']), method: r['method'] as PaymentMethod, at: String(r['at']), currency: String(r['currency']),
  ...opt('reference', r['reference']), ...opt('note', r['note']), ...opt('invoiceId', r['invoiceId']), ...opt('payerType', r['payerType']), ...opt('payerId', r['payerId']),
  ...opt('voidedAt', r['voidedAt']), ...opt('voidReason', r['voidReason']),
} as Payment);

const toRefund = (r: Dto): Refund => ({ id: String(r['id']), amount: Number(r['amount']), method: r['method'] as PaymentMethod, at: String(r['at']), ...opt('reference', r['reference']) });

export const toInvoice = (r: Dto): Invoice => ({
  id: String(r['id']), number: String(r['number']), kind: r['kind'] === 'credit-note' ? 'credit-note' : 'invoice', issuedAt: String(r['issuedAt']),
  total: Number(r['total']), currency: String(r['currency']),
  lines: ((r['lines'] as Dto[] | undefined) ?? []).map((l) => ({ itemId: String(l['itemId'] ?? ''), label: String(l['label']), price: Number(l['price']), ...opt('where', l['where']) })),
  ...opt('dueOn', r['dueOn']), ...opt('cancelsId', r['cancelsId']), ...opt('cancelledAt', r['cancelledAt']), ...opt('cancelReason', r['cancelReason']),
  ...(r['kind'] === 'credit-note' && r['refunds'] ? { refunds: (r['refunds'] as Dto[]).map(toRefund) } : {}),
} as Invoice);

/** Invoices, payments, credit notes and refunds. The server assigns numbers, totals and ids; nothing here is trusted from the browser. */
@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiSession);
  private url = (tail: string): string => this.api.url(tail);
  private patient = (id: string, tail: string): string => this.url(`/patients/${encodeURIComponent(id)}${tail}`);

  /** Newest first; at most `pages` pages (50 invoices, 100 payments each) so a file never loads unbounded history. */
  async load(patientId: string, pages = 4): Promise<{ invoices: Invoice[]; payments: Payment[] }> {
    const all = async <T>(tail: string, limit: number, map: (r: Dto) => T): Promise<T[]> => {
      const out: T[] = []; let cursor: string | null = null;
      for (let i = 0; i < pages; i++) {
        let params = new HttpParams().set('limit', String(limit)); if (tail === '/invoices') params = params.set('withLines', 'true');
        if (cursor) params = params.set('cursor', cursor);
        const r: { items: Dto[]; nextCursor: string | null } = await firstValueFrom(this.http.get<{ items: Dto[]; nextCursor: string | null }>(this.patient(patientId, tail), { params }));
        out.push(...r.items.map(map)); cursor = r.nextCursor; if (!cursor) break;
      }
      return out;
    };
    const [invoices, payments] = await Promise.all([all('/invoices', 50, toInvoice), all('/payments', 100, toPayment)]);
    return { invoices, payments };
  }

  async issue(patientId: string, inv: Invoice): Promise<void> {
    await firstValueFrom(this.http.post(this.patient(patientId, '/invoices'), {
      lines: inv.lines.map((l) => ({ itemId: l.itemId || null, label: l.label, where: l.where || null, price: money(l.price) })), ...(inv.dueOn ? { dueOn: inv.dueOn } : {}),
    }));
  }
  async cancel(invoiceId: string, reason: string): Promise<void> { await firstValueFrom(this.http.post(this.url(`/invoices/${invoiceId}/cancel`), { reason })); }
  async pay(patientId: string, p: Payment): Promise<void> {
    await firstValueFrom(this.http.post(this.patient(patientId, '/payments'), {
      amount: money(p.amount), method: p.method, at: p.at, invoiceId: p.invoiceId ?? null, reference: p.reference ?? null, note: p.note ?? null, payerType: p.payerType ?? null, payerId: p.payerId ?? null,
    }));
  }
  async void(paymentId: string, reason: string): Promise<void> { await firstValueFrom(this.http.post(this.url(`/payments/${paymentId}/void`), { reason })); }
  async refund(creditNoteId: string, r: Refund): Promise<void> {
    await firstValueFrom(this.http.post(this.url(`/invoices/${creditNoteId}/refunds`), { amount: money(r.amount), method: r.method, at: r.at, reference: r.reference ?? null }));
  }
}
