import type { Patient } from '../models/dental.models';
import { paymentsCsv } from './payments-csv';

const head = { date: 'Date', receipt: 'Receipt', patient: 'Patient', method: 'Method', amount: 'Amount' };
const pay = (id: string, at: string, amount: number) => ({ id, at, amount, method: 'cash' as const });
const people = [
  { id: 'a', fullName: '=HYPERLINK("x")', payments: [pay('abcdef123', '2026-10-05T10:00:00.000Z', 300)] },
  { id: 'b', fullName: 'Sara; "Ben"', payments: [pay('zzzzzzzz9', '2026-10-02T10:00:00.000Z', 150), pay('old00000', '2026-08-01T10:00:00.000Z', 99)] },
  { id: 'c', fullName: 'No payments' },
] as unknown as Patient[];

describe('paymentsCsv', () => {
  const csv = paymentsCsv(people, 'month', new Date(2026, 9, 20), head, (m) => m);
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  it('keeps only the period, oldest first', () => {
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain('2026-10-02');
    expect(lines[2]).toContain('2026-10-05');
    expect(csv).not.toContain('old00000'.toUpperCase());
  });
  it('quotes separators and neutralises formulas', () => {
    expect(lines[1]).toContain('"Sara; ""Ben"""');
    expect(lines[2]).toContain("'=HYPERLINK");
  });
});
