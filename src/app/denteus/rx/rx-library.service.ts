import { Injectable, inject, signal } from '@angular/core';
import { ClinicDatabase } from '../services/clinic-database.service';
import { Medication, RxTemplate } from '../models/dental.models';

/** The clinic's own medication list and saved prescriptions (templates). Nothing is built in. */
@Injectable({ providedIn: 'root' })
export class RxLibrary {
  private readonly db = inject(ClinicDatabase);
  readonly medications = signal<Medication[]>([]);
  readonly templates = signal<RxTemplate[]>([]);

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    const ok = <T extends { id: string; name: string }>(v: unknown): T[] => (Array.isArray(v) ? v.filter((x): x is T => !!x && typeof x.id === 'string' && typeof x.name === 'string') : []);
    this.medications.set(ok<Medication>(await this.db.loadSetting<unknown>('medications').catch(() => undefined)));
    this.templates.set(ok<RxTemplate>(await this.db.loadSetting<unknown>('rxTemplates').catch(() => undefined)).map((t) => ({ ...t, items: Array.isArray(t.items) ? t.items : [] })));
  }

  async saveMedication(m: Medication): Promise<void> {
    const list = this.medications();
    const next = list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m];
    this.medications.set(next);
    await this.db.saveSetting('medications', next);
  }

  async saveTemplate(t: RxTemplate): Promise<void> {
    const list = this.templates();
    const next = list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t];
    this.templates.set(next);
    await this.db.saveSetting('rxTemplates', next);
  }

  async removeTemplate(id: string): Promise<void> {
    const next = this.templates().filter((x) => x.id !== id);
    this.templates.set(next);
    await this.db.saveSetting('rxTemplates', next);
  }
}
