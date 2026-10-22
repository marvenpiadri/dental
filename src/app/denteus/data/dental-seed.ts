/**
 * DEMO DATA ONLY.
 *
 * Lets the calendar be tried without a backend. In the real application the clinic's dentists,
 * chairs, patients and appointments come from the Denteus API; turn the seed off with
 * `<den-calendar [seed]="false" />` and load real data instead.
 */
import { addDays, addMinutes, startOfWeek, withMinutes } from '../../calendar/utils/date.utils';
import {
  APPOINTMENT_TYPES,
  Appointment,
  AppointmentStatus,
  Chair,
  Dentist,
  Patient,
  StatusChange,
} from '../models/dental.models';
import { findConflicts } from '../rules/scheduling-rules';

export const DEMO_DENTISTS: Dentist[] = [
  { id: 'd1', name: 'Dr. Idrissi', specialty: 'General dentistry', color: '#2563eb' },
  { id: 'd2', name: 'Dr. Berrada', specialty: 'Orthodontics', color: '#8b5cf6' },
  { id: 'd3', name: 'Dr. Tazi', specialty: 'Endodontics', color: '#10b981' },
];

export const DEMO_CHAIRS: Chair[] = [
  { id: 'c1', name: 'Chair 1' },
  { id: 'c2', name: 'Chair 2' },
  { id: 'c3', name: 'Chair 3' },
  { id: 'c4', name: 'Surgery room' },
];

const PATIENT_NAMES = [
  'Sara Benali',
  'Omar El Fassi',
  'Imane Chraibi',
  'Yassine Lahlou',
  'Khadija Alaoui',
  'Mehdi Bennani',
  'Nadia Tahiri',
  'Hamza Ouazzani',
  'Salma Kettani',
  'Reda Mansouri',
  'Lina Amrani',
  'Anas Squalli',
  'Houda Zniber',
  'Karim Berrada',
  'Meryem Filali',
  'Adil Sebti',
];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAFF = 'Front desk';

/** Status path a booking would have followed to reach `final`, with plausible timestamps. */
function historyFor(final: AppointmentStatus, start: Date, end: Date, created: Date): StatusChange[] {
  const h: StatusChange[] = [{ from: null, to: 'scheduled', at: created, by: STAFF }];
  const push = (to: AppointmentStatus, at: Date) => h.push({ from: h[h.length - 1].to, to, at, by: STAFF });
  switch (final) {
    case 'confirmed':
      push('confirmed', addMinutes(created, 60 * 20));
      break;
    case 'arrived':
      push('confirmed', addMinutes(created, 60 * 20));
      push('arrived', addMinutes(start, -10));
      break;
    case 'in-progress':
      push('confirmed', addMinutes(created, 60 * 20));
      push('arrived', addMinutes(start, -8));
      push('in-progress', addMinutes(start, 2));
      break;
    case 'completed':
      push('confirmed', addMinutes(created, 60 * 20));
      push('arrived', addMinutes(start, -9));
      push('in-progress', addMinutes(start, 3));
      push('completed', addMinutes(end, 2));
      break;
    case 'cancelled':
      push('cancelled', addMinutes(created, 60 * 30));
      break;
    case 'no-show':
      push('no-show', addMinutes(start, 20));
      break;
  }
  return h;
}

export function createSeed(now: Date): { patients: Patient[]; appointments: Appointment[] } {
  const rand = mulberry32(2026);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];

  const patients: Patient[] = PATIENT_NAMES.map((fullName, i) => ({
    id: `p${i + 1}`,
    fullName,
    phone: `+212 6${String(10 + i * 7).padStart(2, '0')} ${String(100 + i * 13).slice(0, 3)} ${String(200 + i * 31).slice(0, 3)}`,
  }));

  const monday = startOfWeek(now, 1);
  const appointments: Appointment[] = [];
  let seq = 0;
  let waiting = 0;

  for (let offset = -7; offset < 14; offset++) {
    const day = addDays(monday, offset);
    const dow = ((offset % 7) + 7) % 7; // 0 = Monday ... 6 = Sunday
    DEMO_DENTISTS.forEach((dentist, di) => {
      // Sunday is an emergency-only day: one dentist, a few bookings
      const target = dow === 6 ? (di === 0 ? 3 : 0) : 5 + Math.floor(rand() * 3);
      let cursor = 8 * 60 + 30 + Math.floor(rand() * 3) * 15;
      let made = 0;
      while (made < target && cursor < 17 * 60) {
        const type = pick(APPOINTMENT_TYPES);
        if (cursor < 13 * 60 && cursor + type.minutes > 13 * 60) cursor = 14 * 60; // lunch break
        const start = withMinutes(day, cursor);
        const end = addMinutes(start, type.minutes);
        const patient = pick(patients);
        const chairs = [...DEMO_CHAIRS].sort(() => rand() - 0.5);
        const chair = chairs.find(
          (c) => findConflicts({ patientId: patient.id, dentistId: dentist.id, chairId: c.id, start, end }, appointments).length === 0,
        );
        cursor += type.minutes + pick([0, 15, 15, 30, 45]);
        if (!chair) continue;

        let status: AppointmentStatus;
        if (end.getTime() <= now.getTime()) {
          const r = rand();
          status = r < 0.8 ? 'completed' : r < 0.9 ? 'no-show' : 'cancelled';
        } else if (start.getTime() <= now.getTime()) {
          status = 'in-progress';
        } else if (start.getTime() - now.getTime() <= 45 * 60_000 && waiting < 2) {
          status = 'arrived';
          waiting++;
        } else {
          status = rand() < 0.55 ? 'confirmed' : 'scheduled';
        }

        const created = addDays(start, -3 - Math.floor(rand() * 10));
        appointments.push({
          id: `a${++seq}`,
          patientId: patient.id,
          dentistId: dentist.id,
          chairId: chair.id,
          type: type.id,
          status,
          start,
          end,
          reason: type.id === 'emergency' ? 'Severe tooth pain' : undefined,
          createdAt: created,
          createdBy: STAFF,
          history: historyFor(status, start, end, created),
          scheduleHistory: [],
        });
        made++;
      }
    });
  }
  injectLiveVisits(now, patients, appointments, seq);
  return { patients, appointments };
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * During opening hours the demo should always show someone in the waiting room and someone in
 * treatment, whatever day it is, so those parts of the UI can be seen working.
 */
function injectLiveVisits(now: Date, patients: Patient[], appointments: Appointment[], startSeq: number): void {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const live = appointments.some((a) => (a.status === 'arrived' || a.status === 'in-progress') && sameDay(a.start, now));
  if (live || minutes < 8 * 60 + 30 || minutes > 17 * 60) return;

  const quarter = Math.floor(minutes / 15) * 15;
  const plans: { dentistId: string; startMin: number; length: number; status: AppointmentStatus; type: (typeof APPOINTMENT_TYPES)[number]['id'] }[] = [
    { dentistId: 'd2', startMin: quarter - 15, length: 45, status: 'in-progress', type: 'orthodontics' },
    { dentistId: 'd1', startMin: quarter + 15, length: 30, status: 'arrived', type: 'checkup' },
  ];
  let seq = startSeq;
  plans.forEach((plan, i) => {
    const start = withMinutes(now, plan.startMin);
    const end = addMinutes(start, plan.length);
    for (const patient of patients.slice(i * 3)) {
      const chair = DEMO_CHAIRS.find(
        (c) => findConflicts({ patientId: patient.id, dentistId: plan.dentistId, chairId: c.id, start, end }, appointments).length === 0,
      );
      if (!chair) continue;
      const created = addDays(start, -5);
      appointments.push({
        id: `a${++seq}`,
        patientId: patient.id,
        dentistId: plan.dentistId,
        chairId: chair.id,
        type: plan.type,
        status: plan.status,
        start,
        end,
        createdAt: created,
        createdBy: STAFF,
        history: historyFor(plan.status, start, end, created),
        scheduleHistory: [],
      });
      return;
    }
  });
}
