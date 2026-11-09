import { CHAIR_TINTS, chairTint } from './chair-tint';

const chairs = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C', color: '#123456' }];

describe('chairTint', () => {
  it('gives each chair its own stable default, in listing order', () => {
    expect(chairTint(chairs, 'a')).toBe(CHAIR_TINTS[0]);
    expect(chairTint(chairs, 'b')).toBe(CHAIR_TINTS[1]);
    expect(chairTint(chairs, 'a')).toBe(chairTint(chairs, 'a'));
  });
  it('prefers a colour set on the chair and wraps past the palette', () => {
    expect(chairTint(chairs, 'c')).toBe('#123456');
    const many = Array.from({ length: 8 }, (_, i) => ({ id: 'x' + i, name: 'X' }));
    expect(chairTint(many, 'x6')).toBe(CHAIR_TINTS[0]);
  });
});
