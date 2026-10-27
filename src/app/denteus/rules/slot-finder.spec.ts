import type { Appointment } from '../models/dental.models';
import { findFreeSlots } from './slot-finder';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m); // Oct 2026: 26 is a Monday
const appt = (over: Partial<Appointment>): Appointment => ({ id: 'x', patientId: 'p1', dentistId: 'd1', chairId: 'c1', start: at(26, 9), end: at(26, 10), status: 'scheduled', ...over }) as Appointment;
const q = { dentistId: 'd1', chairIds: ['c1', 'c2'], patientId: 'p9', durationMin: 30, after: at(26, 8) };

describe('findFreeSlots', () => {
  it('starts at opening time and returns the requested number', () => {
    const s = findFreeSlots(q, [], 3);
    expect(s.map((x) => x.start.getHours() * 60 + x.start.getMinutes())).toEqual([540, 570, 600]);
  });
  it('skips a busy dentist and uses the other chair when only the chair is busy', () => {
    const dentistBusy = findFreeSlots(q, [appt({ chairId: 'c2' })], 1)[0]!;
    expect(dentistBusy.start).toEqual(at(26, 10));
    const chairBusy = findFreeSlots(q, [appt({ dentistId: 'd2' })], 1)[0]!;
    expect(chairBusy).toEqual({ start: at(26, 9), chairId: 'c2' });
  });
  it('ignores cancelled bookings and the appointment being moved', () => {
    expect(findFreeSlots(q, [appt({ status: 'cancelled' })], 1)[0]!.start).toEqual(at(26, 9));
    expect(findFreeSlots({ ...q, excludeId: 'x' }, [appt({})], 1)[0]!.start).toEqual(at(26, 9));
  });
  it('never offers a past time or a Sunday, nor one that runs past closing', () => {
    const late = findFreeSlots({ ...q, after: at(31, 17, 40) }, [], 1)[0]!; // Sat evening → next is Monday
    expect(late.start).toEqual(new Date(2026, 10, 2, 9));
  });
});
