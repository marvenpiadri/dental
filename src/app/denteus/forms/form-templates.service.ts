import { Injectable, inject, signal } from '@angular/core';
import { ClinicDatabase } from '../services/clinic-database.service';
import { FormTemplate } from './form-models';

/** The clinic's uploaded forms (CNSS, CNOPS, certificates...). Kept in this browser's database, outside the backup file. */
@Injectable({ providedIn: 'root' })
export class FormTemplates {
  private readonly db = inject(ClinicDatabase);
  readonly templates = signal<FormTemplate[]>([]);
  readonly loaded = signal(false);
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    return (this.loading ??= this.db.loadSetting<FormTemplate[]>('formTemplates').then((list) => { this.templates.set(list ?? []); this.loaded.set(true); }, () => { this.loaded.set(true); }));
  }

  async put(t: FormTemplate): Promise<void> {
    const next = this.templates().some((x) => x.id === t.id) ? this.templates().map((x) => (x.id === t.id ? t : x)) : [...this.templates(), t];
    await this.db.saveSetting('formTemplates', next); // saved first: a failed write leaves the list as it was
    this.templates.set(next);
  }

  async remove(id: string): Promise<void> {
    const next = this.templates().filter((x) => x.id !== id);
    await this.db.saveSetting('formTemplates', next);
    this.templates.set(next);
  }
}
