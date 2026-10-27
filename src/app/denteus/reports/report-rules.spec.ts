import { Appointment, Dentist, Patient } from '../models/dental.models';
import { buildReport, periodRange } from './report-rules';

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
    expect(report.byMethod).toEqual({ cash: 500, card: 300, transfer: 0 });
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
