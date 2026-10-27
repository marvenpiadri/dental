import { DEFAULT_HOURS, parseHours } from './opening-hours';

describe('parseHours', () => {
  it('reads valid hours', () => expect(parseHours({ open: '08:30', close: '17:00', days: [3, 1, 1] })).toEqual({ startMin: 510, endMin: 1020, days: [1, 3] }));
  it('falls back to the defaults for anything unusable', () => {
    for (const bad of [undefined, {}, { open: '18:00', close: '09:00', days: [1] }, { open: '9', close: '18:00', days: [1] }, { open: '09:00', close: '18:00', days: [] }, { open: '09:00', close: '18:00', days: [9] }]) {
      expect(parseHours(bad)).toEqual(DEFAULT_HOURS);
    }
  });
});
