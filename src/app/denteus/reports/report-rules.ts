import { Appointment, Dentist, Patient, PaymentMethod } from '../models/dental.models';

export type Period = 'month' | '30d' | 'year';

/** `[from, to)`: the start of the first day up to the start of the day after the last. */
export function periodRange(period: Period, now: Date): { from: Date; to: Date } {
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
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

export function buildReport(data: { patients: Patient[]; appointments: Appointment[]; dentists: Dentist[] }, period: Period, now: Date): Report {
  const range = periodRange(period, now);
  const perMonth = period === 'year';

  const bucketStart = (date: Date) => (perMonth ? new Date(date.getFullYear(), date.getMonth(), 1) : new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  const buckets = new Map<number, number>();
  for (let at = new Date(range.from); at < range.to; at = perMonth ? new Date(at.getFullYear(), at.getMonth() + 1, 1) : new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1)) {
    buckets.set(at.getTime(), 0);
  }

  let revenue = 0;
  let charged = 0;
  const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0 };
  for (const patient of data.patients) {
    for (const payment of patient.payments ?? []) {
      const at = new Date(payment.at);
      if (!within(at, range)) continue;
      revenue += payment.amount;
      byMethod[payment.method] += payment.amount;
      const key = bucketStart(at).getTime();
      buckets.set(key, (buckets.get(key) ?? 0) + payment.amount);
    }
    for (const item of patient.plan ?? []) {
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
