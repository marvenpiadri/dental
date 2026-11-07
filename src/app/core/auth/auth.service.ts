import { Injectable, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { ClinicDatabase } from '../../denteus/services/clinic-database.service';
import { Permission, Role, Staff, StaffEvent, Who, can, canManageRole, canRemove, checkPin, diffFromRole, isActive, keepsAnOwner, makeStaff, validPin } from './auth-rules';

const SESSION = 'den-session';

/**
 * Optional team sign-in. No staff yet = open app. Once an owner exists the app asks who is using it.
 * shortcut: this is a UI lock over browser storage (devtools can still read the data); real access control comes with the backend.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(ClinicDatabase);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private loading?: Promise<void>;

  readonly staff = signal<Staff[]>([]);
  readonly ready = signal(false);
  private readonly currentId = signal<string | null>(null);

  readonly locked = computed(() => this.staff().length > 0);
  readonly user = computed(() => this.staff().find((s) => s.id === this.currentId() && isActive(s)) ?? null);
  /** Who did what to the team: roles, permissions, suspensions. Never edited, only added to. */
  readonly events = signal<StaffEvent[]>([]);
  /** True while the sign-in screen must cover the app. */
  readonly gate = computed(() => this.ready() && this.locked() && !this.user());
  /** Open clinics (no team) behave as owner. */
  readonly role = computed<Role>(() => this.user()?.role ?? 'owner');
  private readonly me = computed<Who>(() => this.user() ?? { role: 'owner' });

  can(permission: Permission): boolean { return can(this.me(), permission); }
  canAny(...permissions: Permission[]): boolean { return permissions.some((p) => this.can(p)); }
  /** May the signed-in person manage someone with this role? */
  canManage(role: Role): boolean { return canManageRole(this.me(), role); }

  init(): Promise<void> {
    if (!this.browser) return Promise.resolve();
    this.loading ??= (async () => {
      this.staff.set((await this.db.loadSetting<Staff[]>('staff').catch(() => undefined)) ?? []);
      this.events.set((await this.db.loadSetting<StaffEvent[]>('staffLog').catch(() => undefined)) ?? []);
      try { this.currentId.set(sessionStorage.getItem(SESSION)); } catch { /* private mode: sign in each time */ }
      this.ready.set(true);
    })();
    return this.loading;
  }

  async addStaff(name: string, role: Role, pin: string, jobTitle?: string): Promise<boolean> {
    // the first member must be an owner, otherwise turning the lock on could shut everyone out of Setup
    if (!name.trim() || !validPin(pin) || (!this.locked() && role !== 'owner')) return false;
    if (this.locked() && !(this.can('team.create') && this.canManage(role))) return false;
    const member = await makeStaff(name, role, pin, jobTitle);
    await this.save([...this.staff(), member]);
    await this.record('added', member.name, role);
    if (this.staff().length === 1) this.open(member.id);
    return true;
  }

  async removeStaff(id: string): Promise<boolean> {
    const target = this.staff().find((s) => s.id === id);
    if (!target || !canRemove(this.staff(), id) || !this.can('team.manage') || !this.canManage(target.role)) return false;
    await this.save(this.staff().filter((s) => s.id !== id));
    await this.record('removed', target.name, target.role);
    if (id === this.currentId()) this.signOut();
    return true;
  }

  /** Changes a person's role, job title or permissions (the wanted set, stored as changes to the role's defaults). Permission changes are the owner's. */
  async updateStaff(id: string, patch: { role?: Role; jobTitle?: string; wanted?: ReadonlySet<Permission> }): Promise<boolean> {
    const target = this.staff().find((s) => s.id === id);
    if (!target || !this.can('team.edit') || !this.canManage(target.role) || (patch.role && !this.canManage(patch.role))) return false;
    if (patch.wanted && this.role() !== 'owner') return false;
    const role = patch.role ?? target.role;
    if (!keepsAnOwner(this.staff(), id, { role })) return false;
    const next: Staff = { ...target, role, ...(patch.jobTitle !== undefined ? { jobTitle: patch.jobTitle.trim() || undefined } : {}), ...(patch.wanted ? diffFromRole(role, patch.wanted) : role !== target.role ? { extra: [], removed: [] } : {}) };
    await this.save(this.staff().map((s) => (s.id === id ? next : s)));
    if (role !== target.role) await this.record('role', target.name, `${target.role} → ${role}`);
    if (patch.wanted) await this.record('permissions', target.name, `+${next.extra?.length ?? 0} −${next.removed?.length ?? 0}`);
    return true;
  }

  /** Suspends sign-in without deleting anything the person did. A reason is required. */
  async suspend(id: string, reason: string): Promise<boolean> {
    const target = this.staff().find((s) => s.id === id);
    if (!target || !reason.trim() || !this.can('team.manage') || !this.canManage(target.role) || !keepsAnOwner(this.staff(), id, { suspended: true })) return false;
    await this.save(this.staff().map((s) => (s.id === id ? { ...s, suspendedAt: new Date().toISOString(), suspendedReason: reason.trim() } : s)));
    await this.record('suspended', target.name, reason.trim());
    return true;
  }

  async reactivate(id: string): Promise<boolean> {
    const target = this.staff().find((s) => s.id === id);
    if (!target || !this.can('team.manage') || !this.canManage(target.role)) return false;
    await this.save(this.staff().map((s) => (s.id === id ? { ...s, suspendedAt: undefined, suspendedReason: undefined } : s)));
    await this.record('reactivated', target.name);
    return true;
  }

  private async record(action: StaffEvent['action'], target: string, detail?: string): Promise<void> {
    const events = [...this.events(), { at: new Date().toISOString(), by: this.user()?.name ?? 'Front desk', action, target, ...(detail ? { detail } : {}) }].slice(-200);
    await this.db.saveSetting('staffLog', events);
    this.events.set(events);
  }

  async signIn(id: string, pin: string): Promise<boolean> {
    // shortcut: no attempt limit, a 4-digit PIN is brute-forceable from devtools anyway
    const member = this.staff().find((s) => s.id === id);
    if (!member || !(await checkPin(member, pin))) return false;
    this.open(id);
    return true;
  }

  signOut(): void {
    this.currentId.set(null);
    try { sessionStorage.removeItem(SESSION); } catch { /* ignore */ }
  }

  private open(id: string): void {
    this.currentId.set(id);
    try { sessionStorage.setItem(SESSION, id); } catch { /* ignore */ }
  }

  private async save(staff: Staff[]): Promise<void> {
    await this.db.saveSetting('staff', staff);
    this.staff.set(staff);
  }
}
