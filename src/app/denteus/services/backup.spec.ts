import { Appointment, Patient } from '../models/dental.models';
import { makeBackup, parseBackup } from './backup';

const when = new Date('2026-10-23T09:00:00.000Z');
const patient: Patient = { id: 'p1', fullName: 'Sara Benali', phone: '0612345678', teeth: { '16': 'caries' }, plan: [{ id: 'i1', procedure: 'crown', price: 2500, status: 'done' }], payments: [{ id: 'y1', amount: 500, method: 'cash', at: when.toISOString() }] };
const appointment: Appointment = {
  id: 'a1', patientId: 'p1', dentistId: 'd1', chairId: 'c1', type: 'checkup', status: 'scheduled',
  start: when, end: new Date(when.getTime() + 1_800_000), createdAt: when, createdBy: 'Front desk',
  history: [{ from: null, to: 'scheduled', at: when, by: 'Front desk' }], scheduleHistory: [],
};
const data = { locations: [], dentists: [{ id: 'd1', name: 'Dr. A', specialty: '', color: '#000' }], chairs: [{ id: 'c1', name: 'Chair 1' }], patients: [patient], appointments: [appointment], catalog: [{ id: 'crown', name: 'Zirconia crown', price: 3000 }] };

describe('backup', () => {
  it('round-trips a clinic, dates included', () => {
    const result = parseBackup(makeBackup(data, when));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.patients).toEqual([patient]);
    expect(result.data.catalog).toEqual(data.catalog);
    expect(result.data.appointments[0].start).toEqual(when);
    expect(result.data.appointments[0].history[0].at).toEqual(when);
  });

  it('gives a backup from before the catalog existed the built-in acts', () => {
    const old = JSON.parse(makeBackup(data, when));
    delete old.catalog;
    const result = parseBackup(JSON.stringify(old));
    expect(result.ok && result.data.catalog.length).toBe(8);
  });

  it('refuses files that are not backups', () => {
    expect(parseBackup('nope')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseBackup('{"hello":1}')).toEqual({ ok: false, reason: 'not-a-backup' });
    expect(parseBackup(makeBackup(data, when).replace('"version": 1', '"version": 2'))).toEqual({ ok: false, reason: 'newer-version' });
  });

  it('refuses damaged data instead of half-restoring it', () => {
    const broken = JSON.parse(makeBackup(data, when));
    broken.appointments[0].end = broken.appointments[0].start; // ends when it starts
    expect(parseBackup(JSON.stringify(broken))).toEqual({ ok: false, reason: 'damaged' });
    const noName = JSON.parse(makeBackup(data, when));
    delete noName.patients[0].fullName;
    expect(parseBackup(JSON.stringify(noName))).toEqual({ ok: false, reason: 'damaged' });
  });
});

describe('backup extras', () => {
  const base = { app: 'dentaleus', version: 1, locations: [], dentists: [], chairs: [], patients: [], appointments: [] };
  it('reads practice lists and documents when present, and none when absent', () => {
    expect(parseBackup(JSON.stringify(base))).toMatchObject({ ok: true, data: { practice: undefined, documents: undefined } });
    const r = parseBackup(JSON.stringify({ ...base, practice: { tasks: [{ id: 't' }] }, documents: [{ id: 'd', patientId: 'p', data: 'data:text/plain;base64,aGk=' }] }));
    expect(r).toMatchObject({ ok: true, data: { practice: { tasks: [{ id: 't' }], expenses: [] }, documents: [{ id: 'd' }] } });
  });
  it('refuses a document without its bytes', () => {
    expect(parseBackup(JSON.stringify({ ...base, documents: [{ id: 'd', patientId: 'p' }] }))).toEqual({ ok: false, reason: 'damaged' });
  });
});
