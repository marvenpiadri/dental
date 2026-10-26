import { formatTooth } from './numbering';

describe('formatTooth', () => {
  it('keeps FDI as is', () => expect(formatTooth(26, 'fdi')).toBe('26'));
  it('maps the permanent corners to Universal', () => {
    expect([18, 11, 21, 28, 38, 31, 41, 48].map((n) => formatTooth(n, 'universal'))).toEqual(['1', '8', '9', '16', '17', '24', '25', '32']);
  });
  it('maps primary teeth to letters', () => {
    expect([55, 51, 61, 65, 75, 71, 81, 85].map((n) => formatTooth(n, 'universal'))).toEqual(['A', 'E', 'F', 'J', 'K', 'O', 'P', 'T']);
  });
  it('writes Palmer with the quadrant', () => {
    expect(formatTooth(36, 'palmer')).toBe('LL6');
    expect(formatTooth(52, 'palmer')).toBe('URB');
  });
  it('leaves unknown numbers untouched', () => expect(formatTooth(99, 'universal')).toBe('99'));
});
