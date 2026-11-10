import { Appointment, Patient } from '../models/dental.models';

export interface DoctorStats {
  upcoming: number;
  completedMonth: number;
  completedTotal: number;
  patients: number;
  /** Done acts recorded from this dentist's visits this month. Acts recorded from the chart without a visit cannot be attributed and are not counted. */
  revenueMonth: number;
  acts: { name: string; count: number; amount: number }[];
}

const sameMonth = (iso: string, now: Date) => iso.slice(0, 7) === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

/** What a dentist's profile shows. Pure: the caller passes the clock. `actName` turns a plan item into its display name. */
export function doctorStats(dentistId: string, appointments: readonly Appointment[], patients: readonly Patient[], now: Date, actName: (procedure: string, name?: string) => string): DoctorStats {
  const mine = appointments.filter((a) => a.dentistId === dentistId && a.status !== 'cancelled');
  const ids = new Set(mine.map((a) => a.id));
  const byAct = new Map<string, { name: string; count: number; amount: number }>();
  let revenueMonth = 0;
  for (const p of patients) {
    for (const item of p.plan ?? []) {
      if (item.status !== 'done' || !item.appointmentId || !ids.has(item.appointmentId)) continue;
      const name = actName(item.procedure, item.name);
      const row = byAct.get(name) ?? { name, count: 0, amount: 0 };
      row.count += 1; row.amount += item.price; byAct.set(name, row);
      if (item.doneAt && sameMonth(item.doneAt, now)) revenueMonth += item.price;
    }
  }
  return {
    upcoming: mine.filter((a) => a.start >= now && (a.status === 'scheduled' || a.status === 'confirmed')).length,
    completedMonth: mine.filter((a) => a.status === 'completed' && sameMonth(a.start.toISOString(), now)).length,
    completedTotal: mine.filter((a) => a.status === 'completed').length,
    patients: new Set(mine.map((a) => a.patientId)).size,
    revenueMonth,
    acts: [...byAct.values()].sort((a, b) => b.amount - a.amount),
  };
}
