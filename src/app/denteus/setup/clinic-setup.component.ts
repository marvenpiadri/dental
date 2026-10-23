import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { Chair, Dentist } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';

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
  protected readonly t = inject(I18n).t;

  protected readonly failed = signal(false);
  protected readonly blocked = signal<string | null>(null);

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
