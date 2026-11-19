import { Patient } from '../models/dental.models';
import { mergePatientRecords } from './merge-rules';

const base = (id: string, extra: Partial<Patient> = {}): Patient => ({ id, fullName: `Name ${id}`, phone: '+212 600 000 001', number: `P-000${id}`, ...extra });

describe('mergePatientRecords', () => {
  const on = new Date(2026, 10, 19);
  it('joins the lists, keeps the survivor\'s number and chart, fills only what is missing', () => {
    const keep = base('1', { odontogram: { a: 1 }, email: 'k@x.ma', payments: [{ id: 'p1', amount: 10, method: 'cash', at: '2026-01-01T10:00:00Z' }] });
    const drop = base('2', { odontogram: { b: 2 }, email: 'd@x.ma', city: 'Rabat', alert: 'Penicillin', payments: [{ id: 'p2', amount: 20, method: 'cash', at: '2026-02-01T10:00:00Z' }], letters: [{ id: 'l1', at: '2026-02-02T10:00:00Z', kind: 'certificate', text: 't' }] });
    const m = mergePatientRecords(keep, drop, on);
    expect(m).toMatchObject({ id: '1', number: 'P-0001', email: 'k@x.ma', city: 'Rabat', alert: 'Penicillin', odontogram: { a: 1 } });
    expect(m.payments?.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(m.letters?.length).toBe(1);
    expect(m.notes).toContain('Merged from P-0002');
  });
  it('does not duplicate a record both files already have, and re-points examinations', () => {
    const shared = { id: 'p1', amount: 10, method: 'cash' as const, at: '2026-01-01T10:00:00Z' };
    const exam = { id: 'e1', patientId: '2', date: '2026-01-05', chart: {} } as never;
    const m = mergePatientRecords(base('1', { payments: [shared] }), base('2', { payments: [shared], examinations: [exam] }), on);
    expect(m.payments?.length).toBe(1);
    expect(m.examinations?.[0].patientId).toBe('1');
  });
});
