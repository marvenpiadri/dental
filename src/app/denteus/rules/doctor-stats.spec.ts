import { describe, expect, it } from 'vitest';
import { Appointment, Patient } from '../models/dental.models';
import { doctorStats } from './doctor-stats';

const now = new Date('2026-11-10T12:00:00Z');
const ap = (id: string, dentistId: string, status: Appointment['status'], start: string, patientId = 'p1'): Appointment =>
  ({ id, patientId, dentistId, chairId: 'c', type: 'consultation', status, start: new Date(start), end: new Date(start), createdAt: now, createdBy: 't', history: [], scheduleHistory: [] }) as Appointment;
const patient = { id: 'p1', fullName: 'A', phone: '1', plan: [
  { id: 'i1', procedure: 'filling', price: 400, status: 'done', appointmentId: 'a1', doneAt: '2026-11-03T10:00:00Z' },
  { id: 'i2', procedure: 'filling', price: 300, status: 'done', appointmentId: 'a1', doneAt: '2026-10-03T10:00:00Z' },
  { id: 'i3', procedure: 'cleaning', price: 200, status: 'done', appointmentId: 'other', doneAt: '2026-11-03T10:00:00Z' },
  { id: 'i4', procedure: 'filling', price: 100, status: 'planned', appointmentId: 'a1' },
] } as unknown as Patient;

describe('doctorStats', () => {
  const list = [ap('a1', 'd1', 'completed', '2026-11-03T09:00:00Z'), ap('a2', 'd1', 'scheduled', '2026-11-20T09:00:00Z', 'p2'), ap('a3', 'd1', 'cancelled', '2026-11-21T09:00:00Z'), ap('other', 'd2', 'completed', '2026-11-03T09:00:00Z')];
  const s = doctorStats('d1', list, [patient], now, (id) => id);
  it('counts visits, upcoming and distinct patients without cancelled ones', () => {
    expect(s).toMatchObject({ upcoming: 1, completedMonth: 1, completedTotal: 1, patients: 2 });
  });
  it('attributes only done acts from this dentist\'s visits, revenue only this month', () => {
    expect(s.revenueMonth).toBe(400);
    expect(s.acts).toEqual([{ name: 'filling', count: 2, amount: 700 }]);
  });
});
