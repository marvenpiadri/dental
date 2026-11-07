import { DEFAULT_PREFS, normalizePrefs, toggleMethod, typeMinutes } from './prefs-rules';

describe('clinic preferences', () => {
  it('falls back to defaults for missing or odd data', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ payMethods: ['bitcoin'], reminderDays: 9, typeMinutes: { filling: 2, nope: 30, cleaning: 40 } }))
      .toEqual({ ...DEFAULT_PREFS, typeMinutes: { cleaning: 40 } });
  });
  it('uses the clinic length for a type, else the built-in one', () => {
    const p = normalizePrefs({ typeMinutes: { filling: 75 } });
    expect(typeMinutes(p, 'filling')).toBe(75);
    expect(typeMinutes(p, 'root-canal')).toBe(90);
  });
  it('never lets the last payment method be switched off', () => {
    expect(toggleMethod(['cash'], 'cash')).toEqual(['cash']);
    expect(toggleMethod(['cash', 'card'], 'cash')).toEqual(['card']);
    expect(toggleMethod(['card'], 'cash')).toEqual(['cash', 'card']);
  });
  it('keeps a turned-off reminder list off', () => {
    expect(normalizePrefs({ reminderDays: 0 }).reminderDays).toBe(0);
  });
});
