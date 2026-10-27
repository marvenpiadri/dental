import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ROLES, Role } from '../../core/auth/auth-rules';
import { ROLE_KEY } from '../../core/auth/sign-in.component';
import { Key } from '../../core/i18n/i18n.service';
import { I18n } from '../../core/i18n/i18n.service';
import { fromMin, type OpeningHours } from '../rules/opening-hours';
import { CatalogEntry, Chair, Dentist } from '../models/dental.models';
import { parsePrice, procedureName } from '../patients/treatment-rules';
import { PracticeStore } from '../practice/practice-store.service';
import { ClinicDatabase } from '../services/clinic-database.service';
import { BackupDocument, BackupResult, makeBackup, parseBackup } from '../services/backup';
import { DentalStore } from '../services/dental-store.service';
import { localIsoDay } from '../utils/appointment-labels';

const toDataUrl = (blob: Blob): Promise<string> => new Promise((done, fail) => {
  const reader = new FileReader();
  reader.onload = () => done(reader.result as string);
  reader.onerror = () => fail(reader.error);
  reader.readAsDataURL(blob);
});

const PALETTE = ['#2563eb', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

/** Who treats and where: the dentists and chairs the calendar books against. Every change saves at once. */
@Component({
  selector: 'den-clinic-setup',
  templateUrl: './clinic-setup.component.html',
  styleUrl: './clinic-setup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class ClinicSetupComponent {
  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly auth = inject(AuthService);
  protected readonly roles = ROLES;
  protected readonly roleKey = ROLE_KEY;
  protected readonly teamProblem = signal<Key | null>(null);

  protected async addMember(name: string, role: string, pin: string): Promise<void> {
    this.teamProblem.set((await this.auth.addStaff(name, role as Role, pin)) ? null : 'team.invalid');
  }

  protected async removeMember(id: string): Promise<void> {
    this.teamProblem.set((await this.auth.removeStaff(id)) ? null : 'team.last');
  }

  private readonly practice = inject(PracticeStore);
  private readonly database = inject(ClinicDatabase);
  protected readonly failed = signal(false);
  protected readonly blocked = signal<string | null>(null);

  /** A backup the user picked, waiting for their confirmation before it replaces the clinic. */
  protected readonly pending = signal<Extract<BackupResult, { ok: true }> | null>(null);
  protected readonly importProblem = signal<string | null>(null);
  protected readonly restored = signal(false);

  /** Ids that appointments point to: removing them would orphan those visits. */
  private readonly used = computed(() => {
    const ids = new Set<string>();
    for (const a of this.store.appointments()) { ids.add(a.dentistId); ids.add(a.chairId); }
    return ids;
  });

  protected addDentist(): void {
    const taken = new Set(this.store.dentists().map((d) => d.color));
    const color = PALETTE.find((c) => !taken.has(c)) ?? PALETTE[this.store.dentists().length % PALETTE.length];
    void this.save([...this.store.dentists(), { id: crypto.randomUUID(), name: this.t('setup.dentist.new'), specialty: '', color }], this.store.chairs());
  }

  protected readonly nameOf = (id: string, name?: string) => procedureName(this.t, id, name);

  protected addAct(): void {
    void this.saveActs([...this.store.catalog(), { id: crypto.randomUUID(), name: this.t('setup.act.new'), price: 0 }]);
  }

  protected renameAct(entry: CatalogEntry, name: string): void {
    if (!name) return; // an act without a name can't be picked from the list
    void this.saveActs(this.store.catalog().map((e) => (e.id === entry.id ? { ...e, name } : e)));
  }

  protected repriceAct(entry: CatalogEntry, input: HTMLInputElement): void {
    const price = parsePrice(input.value);
    if (price === null) { input.value = String(entry.price); return; } // keep the old price rather than save nonsense
    void this.saveActs(this.store.catalog().map((e) => (e.id === entry.id ? { ...e, price } : e)));
  }

  /** Old plans keep the name they were written with, so removing an act never changes them. */
  protected removeAct(entry: CatalogEntry): void {
    void this.saveActs(this.store.catalog().filter((e) => e.id !== entry.id));
  }

  private async saveActs(entries: CatalogEntry[]): Promise<void> {
    this.failed.set(false);
    try { await this.store.saveCatalog(entries); } catch { this.failed.set(true); }
  }

  protected addChair(): void {
    void this.save(this.store.dentists(), [...this.store.chairs(), { id: crypto.randomUUID(), name: this.t('setup.chair.new') }]);
  }

  protected editDentist(d: Dentist, change: Partial<Dentist>): void {
    const next = { ...d, ...change };
    if (!next.name.trim()) return; // a nameless dentist can't be told apart in the calendar
    void this.save(this.store.dentists().map((x) => (x.id === d.id ? next : x)), this.store.chairs());
  }

  /** Both times set means own hours; clearing either goes back to the clinic's. Invalid pairs are not stored. */
  protected dentistHoursChange(d: Dentist, patch: { open?: string; close?: string }): void {
    const next = { ...d.hours, ...patch };
    if (!next.open || !next.close) this.editDentist({ ...d, hours: undefined }, { hours: next.open || next.close ? next : undefined });
    else if (next.open < next.close) this.editDentist(d, { hours: next });
  }

  protected editChair(c: Chair, name: string): void {
    if (!name.trim()) return;
    void this.save(this.store.dentists(), this.store.chairs().map((x) => (x.id === c.id ? { ...c, name } : x)));
  }

  protected removeDentist(d: Dentist): void {
    if (this.refuse(d.id, d.name)) return;
    void this.save(this.store.dentists().filter((x) => x.id !== d.id), this.store.chairs());
  }

  protected removeChair(c: Chair): void {
    if (this.refuse(c.id, c.name)) return;
    void this.save(this.store.dentists(), this.store.chairs().filter((x) => x.id !== c.id));
  }

  protected async exportBackup(): Promise<void> {
    const now = new Date();
    const documents = await Promise.all((await this.database.allDocuments()).map(async ({ blob, ...doc }): Promise<BackupDocument> => ({ ...doc, data: await toDataUrl(blob) })));
    const data = { ...this.store.snapshot(), practice: await this.practice.snapshot(), documents };
    const url = URL.createObjectURL(new Blob([makeBackup(data, now)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `dentaleus-backup-${localIsoDay(now)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected async chooseBackup(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // picking the same file again must fire a new change
    this.pending.set(null);
    this.restored.set(false);
    this.importProblem.set(null);
    if (!file) return;
    const result = parseBackup(await file.text());
    if (result.ok) this.pending.set(result);
    else this.importProblem.set(`setup.backup.error.${result.reason}`);
  }

  protected async confirmRestore(): Promise<void> {
    const backup = this.pending();
    if (!backup) return;
    try {
      await this.store.restore(backup.data);
      // backups from before these existed leave them as they are
      if (backup.data.practice) await this.practice.restore(backup.data.practice);
      if (backup.data.documents) await this.database.replaceDocuments(await Promise.all(backup.data.documents.map(async ({ data, ...doc }) => ({ ...doc, blob: await (await fetch(data)).blob() }))));
      this.restored.set(true);
      this.pending.set(null);
    } catch {
      this.importProblem.set('setup.backup.error.save');
    }
  }

  private refuse(id: string, name: string): boolean {
    this.blocked.set(this.used().has(id) ? name : null);
    return this.used().has(id);
  }

  protected readonly weekdays = [1, 2, 3, 4, 5, 6, 0];
  protected weekdayKey(d: number): Key { return `wd.${d}` as Key; }
  protected readonly hoursText = computed(() => ({ open: fromMin(this.store.hours().startMin), close: fromMin(this.store.hours().endMin) }));

  /** Invalid input (a cleared time, closing before opening, no open day) is ignored: the stored hours stay as they were. */
  protected async setHours(patch: Partial<OpeningHours>): Promise<void> {
    // A new clinic has no location yet: the first hours change creates the default one.
    const loc = this.store.locations()[0] ?? { id: crypto.randomUUID(), name: 'Dentaleus', code: 'MAIN', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, active: true };
    const cur = { open: this.hoursText().open, close: this.hoursText().close, days: [...this.store.hours().days] };
    const next = { ...cur, ...patch };
    if (next.open >= next.close || next.days.length === 0 || !/^\d\d:\d\d$/.test(next.open) || !/^\d\d:\d\d$/.test(next.close)) return;
    this.failed.set(false);
    try {
      await this.store.saveLocations(this.store.locations().length ? this.store.locations().map((l) => (l === loc ? { ...l, hours: next } : l)) : [{ ...loc, hours: next }]);
    } catch {
      this.failed.set(true);
    }
  }
  protected toggleDay(d: number): void {
    const days = this.store.hours().days;
    void this.setHours({ days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] });
  }

  private async save(dentists: Dentist[], chairs: Chair[]): Promise<void> {
    this.failed.set(false);
    try {
      await this.store.saveResources(dentists, chairs);
    } catch {
      this.failed.set(true);
    }
  }
}
