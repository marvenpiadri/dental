import { CalendarEvent } from '../models/calendar.models';

export const MS_MIN = 60_000;
export const MS_DAY = 86_400_000;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_MIN);
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), 0, 0);
  const max = daysInMonth(x.getFullYear(), x.getMonth());
  x.setDate(Math.min(d.getDate(), max));
  return x;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfWeek(d: Date, weekStartsOn: number): Date {
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(startOfDay(d), -diff);
}

/** Whole days between two dates, ignoring the time of day (DST safe). */
export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_DAY);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function eachDay(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function withMinutes(day: Date, minutes: number): Date {
  const x = startOfDay(day);
  x.setMinutes(minutes);
  return x;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDateInput(d: Date): string {
  return dateKey(d);
}

export function formatDateTimeInput(d: Date): string {
  return `${dateKey(d)} ${formatTime(d)}`;
}

/** Weekday names / month names through Intl so the calendar follows the chosen locale. */
export function weekdayLabel(d: Date, locale: string, style: 'narrow' | 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(locale, { weekday: style }).format(d);
}

export function monthLabel(d: Date, locale: string, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(locale, { month: style }).format(d);
}

/** 6-row-max month matrix, trimmed to the weeks actually needed. */
export function monthMatrix(focus: Date, weekStartsOn: number): Date[][] {
  const first = startOfMonth(focus);
  const gridStart = startOfWeek(first, weekStartsOn);
  const total = diffDays(gridStart, first) + daysInMonth(first.getFullYear(), first.getMonth());
  const weeks = Math.ceil(total / 7);
  return Array.from({ length: weeks }, (_, w) => eachDay(addDays(gridStart, w * 7), 7));
}

/* ------------------------------------------------------------------ */
/* Event helpers                                                       */
/* ------------------------------------------------------------------ */

/** Last instant that still belongs to the event (an end at exactly 00:00 belongs to the previous day). */
export function lastInstant(e: CalendarEvent): Date {
  return e.end.getTime() > e.start.getTime() ? new Date(e.end.getTime() - 1) : e.end;
}

export function eventFirstDay(e: CalendarEvent): Date {
  return startOfDay(e.start);
}

export function eventLastDay(e: CalendarEvent): Date {
  return startOfDay(lastInstant(e));
}

export function eventCoversDay(e: CalendarEvent, day: Date): boolean {
  const t = startOfDay(day).getTime();
  return eventFirstDay(e).getTime() <= t && t <= eventLastDay(e).getTime();
}

export function isMultiDay(e: CalendarEvent): boolean {
  return eventLastDay(e).getTime() > eventFirstDay(e).getTime();
}

export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID ? c.randomUUID() : `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
