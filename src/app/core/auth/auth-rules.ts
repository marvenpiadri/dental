export type Role = 'owner' | 'dentist' | 'reception';
export type Permission = 'clinical' | 'billing' | 'reports' | 'setup';
export interface Staff { id: string; name: string; role: Role; salt: string; pinHash: string }

export const ROLES: Role[] = ['owner', 'dentist', 'reception'];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: ['clinical', 'billing', 'reports', 'setup'],
  dentist: ['clinical'],
  reception: ['billing'],
};

export const can = (role: Role, permission: Permission): boolean => GRANTS[role].includes(permission);

export const validPin = (pin: string): boolean => /^\d{4,8}$/.test(pin);

/** shortcut: one salted SHA-256, no work factor; fine for a UI lock, replace with server-side hashing (argon2) with the Postgres backend. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makeStaff(name: string, role: Role, pin: string): Promise<Staff> {
  const salt = crypto.randomUUID();
  return { id: crypto.randomUUID(), name: name.trim(), role, salt, pinHash: await hashPin(pin, salt) };
}

export async function checkPin(staff: Staff, pin: string): Promise<boolean> {
  return (await hashPin(pin, staff.salt)) === staff.pinHash;
}

/** The last owner can't be removed: nobody could manage the team or open Reports afterwards. */
export const canRemove = (staff: Staff[], id: string): boolean =>
  staff.find((s) => s.id === id)?.role !== 'owner' || staff.filter((s) => s.role === 'owner').length > 1;
