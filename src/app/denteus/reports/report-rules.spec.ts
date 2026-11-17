import { Appointment, Dentist, Patient } from '../models/dental.models';
import { buildReport, expensesIn, periodRange, receivables } from './report-rules';

const now = new Date(2026, 9, 24, 12, 0); // Sat 24 Oct 2026, local
const dentist: Dentist = { id: 'd1', name: 'Dr. A', specialty: '', color: '#000' };
const visit = (id: string, status: Appointment['status'], start: Date): Appointment => ({
  id, patientId: 'p1', dentistId: 'd1', chairId: 'c1', type: 'checkup', status, start, end: new Date(start.getTime() + 1_800_000), createdAt: start, createdBy: 't', history: [], scheduleHistory: [],
});
const patient: Patient = {
  id: 'p1', fullName: 'Sara', phone: '0612345678', createdAt: new Date(2026, 9, 3).toISOString(),
  payments: [
    { id: 'a', amount: 500, method: 'cash', at: new Date(2026, 9, 10, 9).toISOString() },
    { id: 'b', amount: 300, method: 'card', at: new Date(2026, 9, 10, 15).toISOString() },
    { id: 'c', amount: 900, method: 'cash', at: new Date(2026, 8, 30, 9).toISOString() }, // last month
  ],
  plan: [
    { id: 'i1', procedure: 'crown', price: 2500, status: 'done', doneAt: new Date(2026, 9, 10).toISOString() },
    { id: 'i2', procedure: 'filling', price: 400, status: 'planned' },
    { id: 'i3', procedure: 'filling', price: 400, status: 'done', doneAt: new Date(2026, 8, 1).toISOString() },
  ],
};
const appointments = [
  visit('1', 'completed', new Date(2026, 9, 5, 9)), visit('2', 'completed', new Date(2026, 9, 6, 9)), visit('3', 'no-show', new Date(2026, 9, 7, 9)),
  visit('4', 'cancelled', new Date(2026, 9, 8, 9)), visit('5', 'completed', new Date(2026, 8, 20, 9)),
];
const data = { patients: [patient], appointments, dentists: [dentist] };

describe('periodRange', () => {
  it('covers the whole month, the last 30 days and the year', () => {
    expect(periodRange('month', now)).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) });
    expect(periodRange('30d', now)).toEqual({ from: new Date(2026, 9, 24 - 29), to: new Date(2026, 9, 25) });
    expect(periodRange('year', now)).toEqual({ from: new Date(2026, 0, 1), to: new Date(2027, 0, 1) });
  });
});

describe('buildReport (this month)', () => {
  const report = buildReport(data, 'month', now);
  it('counts money received only inside the period', () => {
    expect(report.revenue).toBe(800);
    expect(report.byMethod).toEqual({ cash: 500, card: 300, transfer: 0, cheque: 0, other: 0 });
  });
  it('charges work by the day it was done', () => expect(report.charged).toBe(2500));
  it('counts visits and the no-show rate', () => {
    expect(report.completed).toBe(2);
    expect(report.noShows).toBe(1);
    expect(report.cancelled).toBe(1);
    expect(report.noShowRate).toBeCloseTo(1 / 3);
  });
  it('counts new patients and visits per dentist', () => {
    expect(report.newPatients).toBe(1);
    expect(report.byDentist[0]).toEqual({ dentist, completed: 2 });
  });
  it('has one bucket per day, summing to the revenue', () => {
    expect(report.series).toHaveLength(31);
    expect(report.series.reduce((n, b) => n + b.amount, 0)).toBe(800);
    expect(report.series.find((b) => b.at.getDate() === 10)?.amount).toBe(800);
  });
});

describe('buildReport (year, empty)', () => {
  it('has twelve month buckets and no rate without visits', () => {
    const report = buildReport({ patients: [], appointments: [], dentists: [dentist] }, 'year', now);
    expect(report.series).toHaveLength(12);
    expect(report.noShowRate).toBeNull();
  });
});

describe('reports and voided payments', () => {
  it('leaves a voided payment out of revenue and the method split', () => {
    const p: Patient = { ...patient, payments: [{ id: 'x', amount: 700, method: 'card', at: new Date(2026, 9, 10, 9).toISOString(), voidedAt: new Date(2026, 9, 11).toISOString(), voidReason: 'Typo' }] };
    const r = buildReport({ patients: [p], appointments: [], dentists: [dentist] }, 'month', now);
    expect(r.revenue).toBe(0);
    expect(r.byMethod.card).toBe(0);
  });
});

describe('expensesIn', () => {
  const now = new Date(2026, 10, 17);
  const list = [{ day: '2026-11-01', amount: 100 }, { day: '2026-11-30', amount: 50 }, { day: '2026-10-31', amount: 999 }, { day: '2026-12-01', amount: 999 }];
  it('counts the first and last day of the month and nothing outside', () => { expect(expensesIn(list, 'month', now)).toBe(150); });
  it('a year covers the whole calendar year', () => { expect(expensesIn(list, 'year', now)).toBe(100 + 50 + 999 + 999); });
});

describe('receivables', () => {
  const act = (price: number) => ({ id: crypto.randomUUID(), status: 'done', price, procedure: 'x', name: 'x', scope: 'teeth', teeth: [], date: '2026-10-01' }) as never;
  const pay = (amount: number) => ({ id: crypto.randomUUID(), amount, method: 'cash', at: '2026-10-02T10:00:00Z' }) as never;
  const person = (fullName: string, plan: unknown[], payments: unknown[], extra = {}) => ({ id: fullName, fullName, plan, payments, ...extra }) as never;
  it('adds up what is owed, biggest first, and skips paid, prepaid and archived patients', () => {
    const r = receivables([
      person('B', [act(300)], [pay(100)]),
      person('A', [act(500)], []),
      person('Paid', [act(100)], [pay(100)]),
      person('Ahead', [act(100)], [pay(400)]),
      person('Gone', [act(900)], [], { archivedAt: '2026-01-01' }),
    ]);
    expect(r.total).toBe(700);
    expect(r.owing).toBe(2);
    expect(r.top.map((x) => x.patient.fullName)).toEqual(['A', 'B']);
  });
});

describe('today as a period', () => {
  it('is the local day, from midnight to the next midnight', () => {
    const { from, to } = periodRange('today', new Date(2026, 10, 17, 18, 30));
    expect(from).toEqual(new Date(2026, 10, 17));
    expect(to).toEqual(new Date(2026, 10, 18));
  });
  it('counts only that day\'s expenses', () => { expect(expensesIn([{ day: '2026-11-17', amount: 40 }, { day: '2026-11-16', amount: 9 }], 'today', new Date(2026, 10, 17, 23, 59))).toBe(40); });
});
