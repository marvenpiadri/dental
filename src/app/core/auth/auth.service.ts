import { Injectable, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { ClinicDatabase } from '../../denteus/services/clinic-database.service';
import { Permission, Role, Staff, can, canRemove, checkPin, makeStaff, validPin } from './auth-rules';

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
  readonly user = computed(() => this.staff().find((s) => s.id === this.currentId()) ?? null);
  /** True while the sign-in screen must cover the app. */
  readonly gate = computed(() => this.ready() && this.locked() && !this.user());
  /** Open clinics (no team) behave as owner. */
  readonly role = computed<Role>(() => this.user()?.role ?? 'owner');

  can(permission: Permission): boolean { return can(this.role(), permission); }

  init(): Promise<void> {
    if (!this.browser) return Promise.resolve();
    this.loading ??= (async () => {
      this.staff.set((await this.db.loadSetting<Staff[]>('staff').catch(() => undefined)) ?? []);
      try { this.currentId.set(sessionStorage.getItem(SESSION)); } catch { /* private mode: sign in each time */ }
      this.ready.set(true);
    })();
    return this.loading;
  }

  async addStaff(name: string, role: Role, pin: string): Promise<boolean> {
    // the first member must be an owner, otherwise turning the lock on could shut everyone out of Setup
    if (!name.trim() || !validPin(pin) || (!this.locked() && role !== 'owner')) return false;
    const member = await makeStaff(name, role, pin);
    await this.save([...this.staff(), member]);
    if (this.staff().length === 1) this.open(member.id);
    return true;
  }

  async removeStaff(id: string): Promise<boolean> {
    if (!canRemove(this.staff(), id)) return false;
    await this.save(this.staff().filter((s) => s.id !== id));
    if (id === this.currentId()) this.signOut();
    return true;
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
