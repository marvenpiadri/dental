import { visibleRange } from './calendar-range';

const d = (s: string) => new Date(`${s}T10:30:00`);
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

describe('visibleRange (unit)', () => {
  it('a day is exactly that day', () => { const r = visibleRange('day', d('2026-11-18'), 1); expect([iso(r.from), iso(r.to)]).toEqual(['2026-11-18', '2026-11-19']); });
  it('a week starts on the configured weekday', () => {
    expect((r => [iso(r.from), iso(r.to)])(visibleRange('week', d('2026-11-18'), 1))).toEqual(['2026-11-16', '2026-11-23']); // Wednesday -> Monday
    expect((r => [iso(r.from), iso(r.to)])(visibleRange('week', d('2026-11-18'), 0))).toEqual(['2026-11-15', '2026-11-22']); // Sunday start
  });
  it('a month covers the six-week grid, so the leading and trailing days are loaded too', () => {
    const r = visibleRange('month', d('2026-11-18'), 1);
    expect([iso(r.from), iso(r.to)]).toEqual(['2026-10-26', '2026-12-07']);
    expect((r.to.getTime() - r.from.getTime()) / 864e5).toBeCloseTo(42, 0);
  });
  it('a year is the calendar year', () => { const r = visibleRange('year', d('2026-06-01'), 1); expect([iso(r.from), iso(r.to)]).toEqual(['2026-01-01', '2027-01-01']); });
});
