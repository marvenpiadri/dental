import type { I18n, Key } from '../../core/i18n/i18n.service';
import type { Appointment, AppointmentStatus, AppointmentTypeId } from '../models/dental.models';

export type Tone = 'ok' | 'warn' | 'info' | 'danger' | 'neutral';

export const STATUS_KEY: Record<AppointmentStatus, Key> = {
  scheduled: 'status.scheduled',
  confirmed: 'status.confirmed',
  arrived: 'status.arrived',
  'in-progress': 'status.inProgress',
  completed: 'status.completed',
  cancelled: 'status.cancelled',
  'no-show': 'status.noShow',
};

/** Colour carries urgency, never the whole meaning: every chip also has its text label. */
export const STATUS_TONE: Record<AppointmentStatus, Tone> = {
  scheduled: 'neutral',
  confirmed: 'info',
  arrived: 'warn',
  'in-progress': 'ok',
  completed: 'neutral',
  cancelled: 'neutral',
  'no-show': 'danger',
};

export const typeKey = (type: AppointmentTypeId): Key => `type.${type}`;

/** Appointments that still take up the dentist's time (they match the conflict rules). */
export const isActive = (a: Appointment): boolean => a.status !== 'cancelled' && a.status !== 'no-show';

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Tomorrow", "Yesterday", otherwise "Mon 26 Oct" in the current language. */
export function relativeDay(i18n: I18n, date: Date, now: Date): string {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (days === 0) return i18n.t('patients.day.today');
  if (days === 1) return i18n.t('patients.day.tomorrow');
  if (days === -1) return i18n.t('patients.day.yesterday');
  const sameYear = date.getFullYear() === now.getFullYear();
  return i18n.date(date, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Minutes since the patient was marked as arrived, or null when the history doesn't say. */
export function waitingMinutes(a: Appointment, now: Date): number | null {
  const arrival = [...a.history].reverse().find((entry) => entry.to === 'arrived');
  return arrival ? Math.max(0, Math.round((now.getTime() - arrival.at.getTime()) / 60_000)) : null;
}

/** `YYYY-MM-DD` of the local calendar day. toISOString() is UTC, so a 00:30 visit would point at the day before. */
export function localIsoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
