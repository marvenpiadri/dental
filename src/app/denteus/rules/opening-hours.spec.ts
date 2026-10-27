import { DEFAULT_HOURS, parseHours } from './opening-hours';

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
