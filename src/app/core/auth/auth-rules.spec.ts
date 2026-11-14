import { ROLES, canManageRole, can, canRemove, checkPin, defaultsOf, diffFromRole, effective, keepsAnOwner, makeStaff, validPin, Permission } from './auth-rules';

const who = (role: (typeof ROLES)[number], extra: Permission[] = [], removed: Permission[] = []) => ({ role, extra, removed });

describe('role defaults', () => {
  it('keeps clinical data away from front desk and billing roles', () => {
    for (const r of ['reception', 'accountant'] as const) for (const p of ['clinical.view', 'clinical.create', 'clinical.edit'] as const) expect(can(who(r), p)).toBe(false);
    expect(can(who('dentist'), 'clinical.edit')).toBe(true);
    expect(can(who('assistant'), 'clinical.edit')).toBe(true);
  });
  it('keeps dentist-only decisions away from assistants', () => {
    expect(can(who('assistant'), 'clinical.approve')).toBe(false);
    expect(can(who('assistant'), 'clinical.void')).toBe(false);
    expect(can(who('dentist'), 'clinical.approve')).toBe(true);
  });
  it('keeps money with billing roles', () => {
    expect(can(who('accountant'), 'billing.void')).toBe(true);
    expect(can(who('reception'), 'billing.create')).toBe(true);
    expect(can(who('reception'), 'billing.void')).toBe(false);
    expect(can(who('dentist'), 'billing.view')).toBe(false);
  });
  it('lets only the owner touch clinic identity', () => {
    expect(can(who('owner'), 'profile.edit')).toBe(true);
    for (const r of ROLES.filter((x) => x !== 'owner')) expect(can(who(r), 'profile.edit')).toBe(false);
  });
  it('gives the administrator operations but not ownership', () => {
    expect(can(who('admin'), 'team.manage')).toBe(true);
    expect(can(who('admin'), 'settings.edit')).toBe(true);
    expect(can(who('admin'), 'team.approve')).toBe(false);
  });
});

describe('customization', () => {
  it('applies owner changes on top of the role', () => {
    const w = who('reception', ['reports.view'], ['billing.create']);
    expect(can(w, 'reports.view')).toBe(true);
    expect(can(w, 'billing.create')).toBe(false);
  });
  it('never grants owner-only permissions and never trims the owner', () => {
    expect(can(who('admin', ['profile.edit']), 'profile.edit')).toBe(false);
    expect(can(who('owner', [], ['profile.edit']), 'profile.edit')).toBe(true);
  });
  it('turns a wanted set back into changes', () => {
    const wanted = new Set(effective(who('reception', ['reports.view'], ['billing.create'])));
    expect(diffFromRole('reception', wanted)).toEqual({ extra: ['reports.view'], removed: ['billing.create'] });
    expect(diffFromRole('reception', new Set(defaultsOf('reception')))).toEqual({ extra: [], removed: [] });
    expect(diffFromRole('reception', new Set([...wanted, 'profile.edit' as Permission])).extra).toEqual(['reports.view']);
  });
});

describe('managing people', () => {
  it('stops non-owners managing owners', () => {
    expect(canManageRole(who('admin'), 'owner')).toBe(false);
    expect(canManageRole(who('admin'), 'dentist')).toBe(true);
    expect(canManageRole(who('dentist'), 'reception')).toBe(false);
    expect(canManageRole(who('owner'), 'owner')).toBe(true);
  });
  it('keeps one active owner', async () => {
    const o = await makeStaff('A', 'owner', '1111');
    const d = await makeStaff('B', 'dentist', '2222');
    expect(canRemove([o, d], o.id)).toBe(false);
    expect(canRemove([o, d], d.id)).toBe(true);
    expect(canRemove([o, { ...o, id: 'x' }, d], o.id)).toBe(true);
    expect(canRemove([o, { ...o, id: 'x', suspendedAt: 'now' }], o.id)).toBe(false);
    expect(keepsAnOwner([o, d], o.id, { role: 'admin' })).toBe(false);
    expect(keepsAnOwner([o, d], o.id, { role: 'owner' })).toBe(true);
  });
});

describe('pins', () => {
  it('accepts 4 to 8 digit PINs only', () => {
    expect(['1234', '12345678'].every(validPin)).toBe(true);
    expect(['123', '123456789', '12a4', ''].some(validPin)).toBe(false);
  });
  it('checks a PIN without storing it, and refuses suspended people', async () => {
    const s = await makeStaff(' Sara ', 'dentist', '4321', ' Orthodontist ');
    expect(s.name).toBe('Sara');
    expect(s.jobTitle).toBe('Orthodontist');
    expect(JSON.stringify(s)).not.toContain('4321');
    expect(await checkPin(s, '4321')).toBe(true);
    expect(await checkPin(s, '1234')).toBe(false);
    expect(await checkPin({ ...s, suspendedAt: 'now' }, '4321')).toBe(false);
  });
});

describe('daily operations by role', () => {
  const day: [string, Permission][] = [
    ['register a patient', 'patients.create'], ['book an appointment', 'appointments.create'], ['record an insurance number or edit a patient', 'patients.edit'],
    ['record a payment', 'billing.create'], ['void a payment', 'billing.void'], ['write a prescription', 'clinical.create'], ['change settings', 'settings.edit'],
  ];
  const expected: Record<string, string[]> = {
    owner: day.map(([n]) => n),
    admin: ['register a patient', 'book an appointment', 'record an insurance number or edit a patient', 'record a payment', 'change settings'],
    dentist: ['register a patient', 'book an appointment', 'record an insurance number or edit a patient', 'write a prescription'],
    assistant: ['write a prescription'],
    reception: ['register a patient', 'book an appointment', 'record an insurance number or edit a patient', 'record a payment'],
    accountant: ['record a payment', 'void a payment'],
  };
  for (const role of ROLES) {
    it(`${role} can do exactly what the front-desk day needs`, () => {
      expect(day.filter(([, p]) => can(who(role), p)).map(([n]) => n)).toEqual(expected[role]);
    });
  }
});

describe('prescribing right', () => {
  it('only owner and dentist hold clinical.approve, so only they issue or correct prescriptions', () => {
    const holders = ROLES.filter((r) => can({ role: r }, 'clinical.approve'));
    expect(holders.sort()).toEqual(['dentist', 'owner']);
  });
});
