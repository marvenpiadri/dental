import { isLate, isLow, monthTotal, wholeNumber } from './practice-rules';

describe('practice rules', () => {
  it('totals one month of expenses', () => {
    const e = [{ id: '1', day: '2026-10-03', label: 'a', amount: 100 }, { id: '2', day: '2026-10-20', label: 'b', amount: 50 }, { id: '3', day: '2026-09-30', label: 'c', amount: 999 }];
    expect(monthTotal(e, '2026-10')).toBe(150);
  });
  it('flags low stock at or under the alert level', () => {
    expect(isLow({ id: '1', name: 'x', qty: 2, min: 2 })).toBe(true);
    expect(isLow({ id: '1', name: 'x', qty: 3, min: 2 })).toBe(false);
  });
  it('is late only while still at the lab after the due day', () => {
    const o = { id: '1', patientId: 'p', work: 'crown', lab: 'L', due: '2026-10-20', status: 'sent' as const };
    expect(isLate(o, '2026-10-21')).toBe(true);
    expect(isLate(o, '2026-10-20')).toBe(false);
    expect(isLate({ ...o, status: 'ready' }, '2026-10-21')).toBe(false);
  });
  it('reads whole numbers only', () => {
    expect(wholeNumber('12')).toBe(12);
    expect([wholeNumber('1.5'), wholeNumber('-3'), wholeNumber(''), wholeNumber('abc', 7)]).toEqual([0, 0, 0, 7]);
  });
});
