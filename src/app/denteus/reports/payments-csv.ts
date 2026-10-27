import type { Patient } from '../models/dental.models';
import { periodRange, type Period } from './report-rules';

/** Spreadsheet formulas typed into a name would run when the file is opened, so those cells get a leading apostrophe. */
const cell = (v: string | number) => {
  const s = typeof v === 'number' ? String(v) : /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Payments received in the period, oldest first. Semicolon-separated with a BOM, which French and Moroccan Excel opens directly. */
export function paymentsCsv(patients: readonly Patient[], period: Period, now: Date, head: { date: string; receipt: string; patient: string; method: string; amount: string }, method: (m: string) => string): string {
  const { from, to } = periodRange(period, now);
  const rows = patients
    .flatMap((p) => (p.payments ?? []).map((x) => ({ p, x, at: new Date(x.at) })))
    .filter(({ at }) => at >= from && at < to)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ p, x }) => [x.at.slice(0, 10), x.id.slice(0, 8).toUpperCase(), p.fullName, method(x.method), x.amount].map(cell).join(';'));
  return '﻿' + [[head.date, head.receipt, head.patient, head.method, head.amount].map(cell).join(';'), ...rows].join('\r\n') + '\r\n';
}
