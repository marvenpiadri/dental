import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ACTIONS, AREAS, OWNER_ONLY, Permission, ROLES, Role, Staff, defaultsOf, effective, isActive } from '../../core/auth/auth-rules';
import { ROLE_KEY } from '../../core/auth/sign-in.component';
import { I18n, Key } from '../../core/i18n/i18n.service';

const AREA_KEY: Record<(typeof AREAS)[number], Key> = { patients: 'perm.area.patients', clinical: 'perm.area.clinical', appointments: 'perm.area.appointments', billing: 'perm.area.billing', reports: 'perm.area.reports', practice: 'perm.area.practice', tasks: 'perm.area.tasks', team: 'perm.area.team', settings: 'perm.area.settings', profile: 'perm.area.profile' };
const ACTION_KEY: Record<(typeof ACTIONS)[number], Key> = { view: 'perm.view', create: 'perm.create', edit: 'perm.edit', approve: 'perm.approve', void: 'perm.void', manage: 'perm.manage' };
const EVENT_KEY: Record<string, Key> = { added: 'team.ev.added', role: 'team.ev.role', permissions: 'team.ev.permissions', suspended: 'team.ev.suspended', reactivated: 'team.ev.reactivated', removed: 'team.ev.removed' };

/** Settings → Team and permissions. Roles are the defaults; the owner can adjust a person's permissions. Backend enforcement comes later. */
@Component({
  selector: 'den-team',
  templateUrl: './team.component.html',
  styleUrl: './team.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamComponent {
  protected readonly auth = inject(AuthService);
  protected readonly t = inject(I18n).t;
  protected readonly areas = AREAS; protected readonly actions = ACTIONS;
  protected readonly roleKey = ROLE_KEY; protected readonly areaKey = AREA_KEY; protected readonly actionKey = ACTION_KEY; protected readonly eventKey = EVENT_KEY;
  protected readonly isActive = isActive;
  /** Roles the signed-in person may give out. */
  protected readonly assignable = computed<Role[]>(() => ROLES.filter((r) => !this.auth.locked() ? r === 'owner' : this.auth.canManage(r)));
  protected readonly open = signal<string | null>(null);
  protected readonly wanted = signal<ReadonlySet<Permission>>(new Set());
  protected readonly problem = signal<Key | null>(null);
  protected readonly recent = computed(() => [...this.auth.events()].reverse().slice(0, 12));

  protected toggle(m: Staff): void {
    if (this.open() === m.id) { this.open.set(null); return; }
    this.open.set(m.id); this.wanted.set(effective(m)); this.problem.set(null);
  }
  protected perm(area: string, action: string): Permission { return `${area}.${action}` as Permission; }
  protected has(p: Permission): boolean { return this.wanted().has(p); }
  protected locked(m: Staff, p: Permission): boolean { return m.role === 'owner' || OWNER_ONLY.includes(p) || this.auth.role() !== 'owner'; }
  protected pick(p: Permission, on: boolean): void { const s = new Set(this.wanted()); on ? s.add(p) : s.delete(p); this.wanted.set(s); }
  protected reset(m: Staff): void { this.wanted.set(new Set(defaultsOf(m.role))); }
  protected changed(m: Staff): boolean { return (m.extra?.length ?? 0) + (m.removed?.length ?? 0) > 0; }

  protected async add(name: string, job: string, role: string, pin: string): Promise<void> { this.problem.set((await this.auth.addStaff(name, role as Role, pin, job)) ? null : 'team.invalid'); }
  protected async savePerms(m: Staff): Promise<void> { this.problem.set((await this.auth.updateStaff(m.id, { wanted: this.wanted() })) ? null : 'team.denied'); }
  protected async saveRole(m: Staff, role: string, job: string): Promise<void> {
    const ok = await this.auth.updateStaff(m.id, { jobTitle: job, ...(role !== m.role ? { role: role as Role } : {}) });
    this.problem.set(ok ? null : role !== m.role ? 'team.last' : 'team.denied');
    if (ok) this.wanted.set(effective({ ...m, role: role as Role, extra: [], removed: [] }));
  }
  protected async suspend(m: Staff, reason: string): Promise<void> { this.problem.set((await this.auth.suspend(m.id, reason)) ? null : reason.trim() ? 'team.last' : 'team.reason.need'); }
  protected async reactivate(m: Staff): Promise<void> { this.problem.set((await this.auth.reactivate(m.id)) ? null : 'team.denied'); }
  protected async remove(m: Staff): Promise<void> { this.problem.set((await this.auth.removeStaff(m.id)) ? null : 'team.last'); }
}
