import { CHILD_LOWER, CHILD_UPPER, toggleSurface } from './surface-rules';

describe('surfaces', () => {
  it('toggles a surface and keeps M O D B L order', () => {
    expect(toggleSurface([], 'D')).toEqual(['D']);
    expect(toggleSurface(['D'], 'M')).toEqual(['M', 'D']);
    expect(toggleSurface(['M', 'D'], 'M')).toEqual(['D']);
    expect(toggleSurface(['L', 'O'], 'B')).toEqual(['O', 'B', 'L']);
  });
  it('has ten baby teeth per jaw', () => {
    expect(CHILD_UPPER).toHaveLength(10);
    expect(CHILD_LOWER).toHaveLength(10);
  });
});
