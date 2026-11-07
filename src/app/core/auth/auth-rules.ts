export type Role = 'owner' | 'admin' | 'dentist' | 'assistant' | 'reception' | 'accountant';
export type Area = 'patients' | 'clinical' | 'appointments' | 'billing' | 'reports' | 'practice' | 'tasks' | 'team' | 'settings' | 'profile';
export type Action = 'view' | 'create' | 'edit' | 'approve' | 'void' | 'manage';
export type Permission = `${Area}.${Action}`;

export interface Staff {
  id: string; name: string; role: Role; salt: string; pinHash: string;
  /** What the person is called at work. Display only: it grants nothing. */
  jobTitle?: string;
  /** Owner-made changes to the role's defaults. */
  extra?: Permission[]; removed?: Permission[];
  /** Set while the person is suspended; their history stays. */
  suspendedAt?: string; suspendedReason?: string;
}

export const ROLES: Role[] = ['owner', 'admin', 'dentist', 'assistant', 'reception', 'accountant'];
export const AREAS: Area[] = ['patients', 'clinical', 'appointments', 'billing', 'reports', 'practice', 'tasks', 'team', 'settings', 'profile'];
export const ACTIONS: Action[] = ['view', 'create', 'edit', 'approve', 'void', 'manage'];

const all = (a: Area, ...x: Action[]): Permission[] => (x.length ? x : ACTIONS).map((y) => `${a}.${y}` as Permission);

/** Role defaults. Clinical data stays with the clinical roles; money stays with billing roles. */
const DEFAULTS: Record<Role, readonly Permission[]> = {
  owner: AREAS.flatMap((a) => all(a)),
  admin: [...all('patients', 'view', 'create', 'edit', 'manage'), ...all('appointments'), ...all('billing', 'view', 'create', 'edit'), ...all('reports', 'view'), ...all('practice'), ...all('tasks'), ...all('team', 'view', 'create', 'edit', 'manage'), ...all('settings', 'view', 'edit', 'manage'), ...all('profile', 'view')],
  dentist: [...all('patients', 'view', 'create', 'edit'), ...all('clinical', 'view', 'create', 'edit', 'approve', 'void'), ...all('appointments', 'view', 'create', 'edit'), ...all('practice', 'view', 'create'), ...all('tasks', 'view', 'create', 'edit')],
  assistant: [...all('patients', 'view'), ...all('clinical', 'view', 'create', 'edit'), ...all('appointments', 'view', 'edit'), ...all('practice', 'view', 'create', 'edit'), ...all('tasks', 'view', 'create', 'edit')],
  reception: [...all('patients', 'view', 'create', 'edit'), ...all('appointments', 'view', 'create', 'edit', 'manage'), ...all('billing', 'view', 'create'), ...all('tasks', 'view', 'create', 'edit')],
  accountant: [...all('patients', 'view'), ...all('billing', 'view', 'create', 'edit', 'approve', 'void'), ...all('reports', 'view'), ...all('practice', 'view'), ...all('tasks', 'view')],
};

/** Clinic identity and ownership are never delegated, whatever the owner ticks. */
export const OWNER_ONLY: readonly Permission[] = ['profile.create', 'profile.edit', 'profile.approve', 'profile.void', 'profile.manage', 'team.approve', 'team.void'];

export const defaultsOf = (role: Role): readonly Permission[] => DEFAULTS[role];

export type Who = Pick<Staff, 'role' | 'extra' | 'removed'>;
export function effective(who: Who): Set<Permission> {
  const out = new Set<Permission>(DEFAULTS[who.role]);
  if (who.role === 'owner') return out;
  for (const p of who.extra ?? []) if (!OWNER_ONLY.includes(p)) out.add(p);
  for (const p of who.removed ?? []) out.delete(p);
  return out;
}

export const can = (who: Who, permission: Permission): boolean => effective(who).has(permission);

/** Turns a wanted set of permissions into the owner's changes to the role's defaults. Owner-only permissions are ignored. */
export function diffFromRole(role: Role, wanted: ReadonlySet<Permission>): Pick<Staff, 'extra' | 'removed'> {
  const base = new Set(DEFAULTS[role]);
  const extra = [...wanted].filter((p) => !base.has(p) && !OWNER_ONLY.includes(p));
  const removed = [...base].filter((p) => !wanted.has(p));
  return { extra, removed };
}

/** Owners manage everyone. Others (with team permission) manage only roles below owner, and never themselves into a higher role. */
export const canManageRole = (actor: Who, target: Role): boolean => actor.role === 'owner' || (can(actor, 'team.manage') && target !== 'owner');

export const validPin = (pin: string): boolean => /^\d{4,8}$/.test(pin);

/** shortcut: one salted SHA-256, no work factor; fine for a UI lock, replace with server-side hashing (argon2) with the Postgres backend. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makeStaff(name: string, role: Role, pin: string, jobTitle?: string): Promise<Staff> {
  const salt = crypto.randomUUID();
  return { id: crypto.randomUUID(), name: name.trim(), role, salt, pinHash: await hashPin(pin, salt), ...(jobTitle?.trim() ? { jobTitle: jobTitle.trim() } : {}) };
}

export const isActive = (s: Staff): boolean => !s.suspendedAt;

export async function checkPin(staff: Staff, pin: string): Promise<boolean> {
  return isActive(staff) && (await hashPin(pin, staff.salt)) === staff.pinHash;
}

/** The last active owner can't be removed, suspended or demoted: nobody could manage the team afterwards. */
export const keepsAnOwner = (staff: Staff[], id: string, becomes?: { role?: Role; suspended?: boolean }): boolean => {
  const target = staff.find((s) => s.id === id);
  if (target?.role !== 'owner' || !isActive(target)) return true;
  const stays = becomes?.role === undefined || becomes.role === 'owner';
  if (stays && !becomes?.suspended && becomes) return true;
  return staff.some((s) => s.id !== id && s.role === 'owner' && isActive(s));
};
export const canRemove = (staff: Staff[], id: string): boolean => keepsAnOwner(staff, id, { suspended: true });

export interface StaffEvent { at: string; by: string; action: 'added' | 'role' | 'permissions' | 'suspended' | 'reactivated' | 'removed'; target: string; detail?: string }
