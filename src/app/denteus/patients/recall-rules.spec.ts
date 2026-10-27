import { Appointment, Patient } from '../models/dental.models';
import { recallDue } from './recall-rules';

const p = (id: string) => ({ id, fullName: id }) as Patient;
const a = (patientId: string, start: string, status: Appointment['status']) => ({ patientId, start: new Date(start), status }) as Appointment;
const now = new Date('2026-10-24T10:00:00');

describe('recallDue', () => {
  it('lists patients last seen 6+ months ago with nothing booked, oldest first', () => {
    const rows = recallDue([p('old'), p('older'), p('recent'), p('booked'), p('never')], [
      a('old', '2026-03-01T09:00:00', 'completed'),
      a('older', '2025-11-01T09:00:00', 'completed'),
      a('recent', '2026-08-01T09:00:00', 'completed'),
      a('booked', '2026-01-01T09:00:00', 'completed'),
      a('booked', '2026-11-05T09:00:00', 'scheduled'),
      a('never', '2026-01-01T09:00:00', 'no-show'),
    ], now);
    expect(rows.map((r) => r.patient.id)).toEqual(['older', 'old']);
  });
  it('ignores a cancelled future visit', () => {
    expect(recallDue([p('x')], [a('x', '2026-01-01T09:00:00', 'completed'), a('x', '2026-11-05T09:00:00', 'cancelled')], now)).toHaveLength(1);
  });
});
