import { LEGACY_CURRENCY, inCurrency, planInCurrency } from '../regional/regional-rules';
import { invoiceState, refundedTotal } from '../patients/invoice-rules';
import { balance } from '../patients/treatment-rules';
import { Appointment, Dentist, Patient, PaymentMethod } from '../models/dental.models';

export type Period = 'today' | 'month' | '30d' | 'year';

/** `[from, to)`: the start of the first day up to the start of the day after the last. */
export function periodRange(period: Period, now: Date): { from: Date; to: Date } {
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  if (period === 'today') return { from: day(0), to: day(1) };
  if (period === '30d') return { from: day(-29), to: day(1) };
  if (period === 'year') return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) };
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

export interface Report {
  revenue: number;
  charged: number;
  byMethod: Record<PaymentMethod, number>;
  completed: number;
  noShows: number;
  cancelled: number;
  /** No-shows as a share of visits that were due to happen (completed + no-shows); null when there were none. */
  noShowRate: number | null;
  newPatients: number;
  byDentist: { dentist: Dentist; completed: number }[];
  /** Money received per day, or per month for a year: `at` is the bucket's first day. */
  series: { at: Date; amount: number }[];
}

const within = (value: Date, range: { from: Date; to: Date }) => value >= range.from && value < range.to;

/** Money counts only in `currency` (the clinic's current one): payments made in another currency stay on file but are never added in. */
export function buildReport(data: { patients: Patient[]; appointments: Appointment[]; dentists: Dentist[] }, period: Period, now: Date, currency = LEGACY_CURRENCY): Report {
  const range = periodRange(period, now);
  const perMonth = period === 'year';

  const bucketStart = (date: Date) => (perMonth ? new Date(date.getFullYear(), date.getMonth(), 1) : new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  const buckets = new Map<number, number>();
  for (let at = new Date(range.from); at < range.to; at = perMonth ? new Date(at.getFullYear(), at.getMonth() + 1, 1) : new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1)) {
    buckets.set(at.getTime(), 0);
  }

  let revenue = 0;
  let charged = 0;
  const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0, cheque: 0, other: 0 };
  for (const patient of data.patients) {
    for (const payment of inCurrency(patient.payments ?? [], currency)) {
      if (payment.voidedAt) continue;
      const at = new Date(payment.at);
      if (!within(at, range)) continue;
      revenue += payment.amount;
      byMethod[payment.method] += payment.amount;
      const key = bucketStart(at).getTime();
      buckets.set(key, (buckets.get(key) ?? 0) + payment.amount);
    }
    for (const item of planInCurrency(patient.plan ?? [], currency)) {
      if (item.status === 'done' && item.doneAt && within(new Date(item.doneAt), range)) charged += item.price;
    }
  }

  const visits = data.appointments.filter((a) => within(a.start, range));
  const count = (status: Appointment['status']) => visits.filter((a) => a.status === status).length;
  const completed = count('completed');
  const noShows = count('no-show');

  return {
    revenue,
    charged,
    byMethod,
    completed,
    noShows,
    cancelled: count('cancelled'),
    noShowRate: completed + noShows ? noShows / (completed + noShows) : null,
    newPatients: data.patients.filter((p) => p.createdAt && within(new Date(p.createdAt), range)).length,
    byDentist: data.dentists
      .map((dentist) => ({ dentist, completed: visits.filter((a) => a.dentistId === dentist.id && a.status === 'completed').length }))
      .sort((a, b) => b.completed - a.completed),
    series: [...buckets].map(([time, amount]) => ({ at: new Date(time), amount })),
  };
}

/** Expenses whose day falls in the period. `day` is "YYYY-MM-DD" in local time, so it is compared as a local date, not parsed as UTC. */
export function expensesIn(expenses: readonly { day: string; amount: number }[], period: Period, now: Date): number {
  const { from, to } = periodRange(period, now);
  return expenses.reduce((sum, e) => { const [y, m, d] = e.day.split('-').map(Number); return within(new Date(y, m - 1, d), { from, to }) ? sum + e.amount : sum; }, 0);
}

/** What patients owe right now (a snapshot, not tied to the period): total and the biggest balances first. Prepaid patients owe nothing. */
export function receivables(patients: readonly Patient[], currency = LEGACY_CURRENCY, top = 5): { total: number; owing: number; top: { patient: Patient; due: number }[] } {
  const rows = patients
    .filter((p) => !p.archivedAt)
    .map((patient) => ({ patient, due: balance(planInCurrency(patient.plan ?? [], currency), inCurrency(patient.payments ?? [], currency), refundedTotal(inCurrency(patient.invoices ?? [], currency))).due }))
    .filter((r) => r.due > 0)
    .sort((a, b) => b.due - a.due || a.patient.fullName.localeCompare(b.patient.fullName));
  return { total: rows.reduce((n, r) => n + r.due, 0), owing: rows.length, top: rows.slice(0, top) };
}

/** Standing invoices past their due day with money still owed, oldest due first. Only invoices issued with a payment term have a due day. */
export function overdueInvoices(patients: readonly Patient[], now: Date, currency = LEGACY_CURRENCY, top = 5): { count: number; total: number; top: { patient: Patient; number: string; dueOn: string; remaining: number }[] } {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rows = patients.filter((p) => !p.archivedAt).flatMap((patient) => (patient.invoices ?? [])
    .filter((i) => i.kind === 'invoice' && i.dueOn && i.dueOn < today && (i.currency ?? LEGACY_CURRENCY) === currency)
    .map((i) => ({ patient, number: i.number, dueOn: i.dueOn!, remaining: invoiceState(i, patient.payments ?? []).remaining }))
    .filter((r) => r.remaining > 0)).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.number.localeCompare(b.number));
  return { count: rows.length, total: rows.reduce((n, r) => n + r.remaining, 0), top: rows.slice(0, top) };
}

/** Spending in the period per category, biggest first; expenses without a category count as `other`. */
export function expensesByCategory(expenses: readonly { day: string; amount: number; category?: string }[], period: Period, now: Date): { category: string; total: number }[] {
  const { from, to } = periodRange(period, now);
  const sums = new Map<string, number>();
  for (const e of expenses) {
    const [y, m, d] = e.day.split('-').map(Number);
    if (within(new Date(y, m - 1, d), { from, to })) sums.set(e.category ?? 'other', (sums.get(e.category ?? 'other') ?? 0) + e.amount);
  }
  return [...sums].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}
