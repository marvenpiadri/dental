import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { CatalogEntry, Chair, Dentist } from '../models/dental.models';
import { parsePrice, procedureName } from '../patients/treatment-rules';
import { BackupResult, makeBackup, parseBackup } from '../services/backup';
import { DentalStore } from '../services/dental-store.service';
import { localIsoDay } from '../utils/appointment-labels';

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

  protected exportBackup(): void {
    const now = new Date();
    const url = URL.createObjectURL(new Blob([makeBackup(this.store.snapshot(), now)], { type: 'application/json' }));
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

  private async save(dentists: Dentist[], chairs: Chair[]): Promise<void> {
    this.failed.set(false);
    try {
      await this.store.saveResources(dentists, chairs);
    } catch {
      this.failed.set(true);
    }
  }
}
