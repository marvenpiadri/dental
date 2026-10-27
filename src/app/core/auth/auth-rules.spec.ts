import { canRemove, can, checkPin, makeStaff, validPin } from './auth-rules';

describe('auth rules', () => {
  it('grants by role', () => {
    expect(can('owner', 'reports')).toBe(true);
    expect(can('dentist', 'clinical')).toBe(true);
    expect(can('dentist', 'billing')).toBe(false);
    expect(can('reception', 'clinical')).toBe(false);
    expect(can('reception', 'setup')).toBe(false);
  });

  it('accepts 4 to 8 digit PINs only', () => {
    expect(['1234', '12345678'].every(validPin)).toBe(true);
    expect(['123', '123456789', '12a4', ''].some(validPin)).toBe(false);
  });

  it('checks a PIN without storing it', async () => {
    const s = await makeStaff(' Sara ', 'dentist', '4321');
    expect(s.name).toBe('Sara');
    expect(JSON.stringify(s)).not.toContain('4321');
    expect(await checkPin(s, '4321')).toBe(true);
    expect(await checkPin(s, '1234')).toBe(false);
  });

  it('keeps the last owner', async () => {
    const o = await makeStaff('A', 'owner', '1111');
    const d = await makeStaff('B', 'dentist', '2222');
    expect(canRemove([o, d], o.id)).toBe(false);
    expect(canRemove([o, d], d.id)).toBe(true);
    expect(canRemove([o, { ...o, id: 'x' }, d], o.id)).toBe(true);
  });
});
