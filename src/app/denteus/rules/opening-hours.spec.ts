import { closureOn, DEFAULT_HOURS, defaultStartMin, outsideHours, parseHours } from './opening-hours';

describe('parseHours', () => {
  it('reads valid hours', () => expect(parseHours({ open: '08:30', close: '17:00', days: [3, 1, 1] })).toEqual({ startMin: 510, endMin: 1020, days: [1, 3] }));
  it('falls back to the defaults for anything unusable', () => {
    for (const bad of [undefined, {}, { open: '18:00', close: '09:00', days: [1] }, { open: '9', close: '18:00', days: [1] }, { open: '09:00', close: '18:00', days: [] }, { open: '09:00', close: '18:00', days: [9] }]) {
      expect(parseHours(bad)).toEqual(DEFAULT_HOURS);
    }
  });
});

import { dentistHours } from './opening-hours';

describe('dentistHours', () => {
  it('overrides the times but keeps the clinic days', () => {
    expect(dentistHours(DEFAULT_HOURS, { open: '10:00', close: '14:00' })).toEqual({ startMin: 600, endMin: 840, days: DEFAULT_HOURS.days });
  });
  it('falls back to the clinic when unset or invalid', () => {
    expect(dentistHours(DEFAULT_HOURS, undefined)).toBe(DEFAULT_HOURS);
    expect(dentistHours(DEFAULT_HOURS, { open: '15:00', close: '10:00' })).toBe(DEFAULT_HOURS);
  });
});

describe('outsideHours', () => {
  const at = (iso: string, min: number) => { const s = new Date(iso); return [s, new Date(s.getTime() + min * 60_000)] as const; };
  it('accepts a slot inside the hours, ending exactly at closing', () => expect(outsideHours(...at('2026-11-12T17:30:00', 30), DEFAULT_HOURS)).toBe(false));
  it('flags a slot that starts too late, ends after closing, or falls on a closed day', () => {
    expect(outsideHours(...at('2026-11-12T21:00:00', 30), DEFAULT_HOURS)).toBe(true);
    expect(outsideHours(...at('2026-11-12T17:45:00', 30), DEFAULT_HOURS)).toBe(true);
    expect(outsideHours(...at('2026-11-15T10:00:00', 30), DEFAULT_HOURS)).toBe(true); // Sunday
  });
});

describe('defaultStartMin', () => {
  const h = { startMin: 9 * 60, endMin: 18 * 60, days: [1, 2, 3, 4, 5, 6] };
  it('starts at opening on another day', () => expect(defaultStartMin(null, h)).toBe(540));
  it('rounds up to the next quarter hour during the day', () => expect(defaultStartMin(10 * 60 + 1, h)).toBe(615));
  it('never proposes a time before opening', () => expect(defaultStartMin(4 * 60 + 40, h)).toBe(540));
  it('falls back to opening when the slot would run past closing', () => { expect(defaultStartMin(17 * 60 + 40, h)).toBe(540); expect(defaultStartMin(17 * 60 + 20, h)).toBe(17 * 60 + 30); });
});

describe('closureOn', () => {
  const list = [{ from: '2026-12-24', to: '2026-12-26', reason: 'Holiday' }, { from: '2026-11-06', to: '' }];
  it('finds a closure covering the day, bounds included, and none otherwise', () => {
    expect(closureOn(new Date(2026, 11, 26, 9), list)?.reason).toBe('Holiday');
    expect(closureOn(new Date(2026, 11, 27, 9), list)).toBeUndefined();
    expect(closureOn(new Date(2026, 10, 6, 9), list)).toBeDefined();
    expect(closureOn(new Date(2026, 10, 6, 9), undefined)).toBeUndefined();
  });
});
