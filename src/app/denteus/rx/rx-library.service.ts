import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ClinicDatabase } from '../services/clinic-database.service';
import { DentalStore } from '../services/dental-store.service';
import { AllergyDef, LibMedication, RxTemplate } from '../models/dental.models';
import { allergyDependencies, allergyInUse, allergyProblem, medDeleteBlocks, medDependencies, medProblem, mergeAllergies, readMedications, tidyMedication } from './med-library';

/** The clinic's own libraries: medications (generic and brand), allergies and saved prescriptions. Nothing is built in. */
@Injectable({ providedIn: 'root' })
export class RxLibrary {
  private readonly db = inject(ClinicDatabase);
  private readonly store = inject(DentalStore);
  private readonly auth = inject(AuthService);
  readonly medications = signal<LibMedication[]>([]);
  readonly allergies = signal<AllergyDef[]>([]);
  readonly templates = signal<RxTemplate[]>([]);
  /** Libraries read from this browser. Pages wait for it before reading a patient against them. */
  readonly loaded = signal(false);

  constructor() { void this.load(); }

  get canEdit(): boolean { return this.auth.can('clinical.edit'); }

  private async load(): Promise<void> {
    const arr = async (key: string) => { const v = await this.db.loadSetting<unknown>(key).catch(() => undefined); return Array.isArray(v) ? v : []; };
    const meds = readMedications(await arr('medications'), () => crypto.randomUUID());
    this.medications.set(meds.list);
    if (meds.migrated) await this.db.saveSetting('medications', meds.list).catch(() => undefined); // the old flat entries, now generic and brand
    this.allergies.set((await arr('allergyDefs')).filter((x): x is AllergyDef => !!x && typeof x.id === 'string' && typeof x.name === 'string'));
    this.templates.set((await arr('rxTemplates')).filter((x): x is RxTemplate => !!x && typeof x.id === 'string' && typeof x.name === 'string').map((t) => ({ ...t, items: Array.isArray(t.items) ? t.items : [] })));
    this.loaded.set(true);
  }

  private async put(key: string, list: unknown[]): Promise<void> { await this.db.saveSetting(key, list); }

  /* medications */
  async saveMedication(m: LibMedication): Promise<'name' | 'generic' | 'duplicate' | null> {
    if (!this.canEdit) return 'name';
    const next = tidyMedication(m);
    const problem = medProblem(this.medications(), next);
    if (problem) return problem;
    const list = this.medications();
    const out = list.some((x) => x.id === next.id) ? list.map((x) => (x.id === next.id ? next : x)) : [...list, next];
    this.medications.set(out);
    await this.put('medications', out);
    return null;
  }
  medicationDeps(id: string) { return medDependencies(id, this.medications(), this.allergies(), this.templates(), this.store.patients()); }
  /** Deletes only when nothing refers to it; otherwise returns what blocks it. Hiding is the alternative. */
  async deleteMedication(id: string) {
    const blocks = medDeleteBlocks(this.medicationDeps(id));
    if (!this.canEdit || blocks.length) return blocks;
    const out = this.medications().filter((m) => m.id !== id);
    this.medications.set(out);
    await this.put('medications', out);
    return [];
  }

  /* allergies */
  async saveAllergy(a: AllergyDef): Promise<'name' | 'duplicate' | null> {
    if (!this.canEdit) return 'name';
    const next: AllergyDef = { id: a.id, name: a.name.trim(), ...(a.medicationId ? { medicationId: a.medicationId } : {}), ...(a.externalId?.trim() ? { externalId: a.externalId.trim() } : {}), ...(a.hidden ? { hidden: true } : {}) };
    const problem = allergyProblem(this.allergies(), next);
    if (problem) return problem;
    const list = this.allergies();
    const out = list.some((x) => x.id === next.id) ? list.map((x) => (x.id === next.id ? next : x)) : [...list, next];
    this.allergies.set(out);
    await this.put('allergyDefs', out);
    return null;
  }
  allergyDeps(id: string) { return allergyDependencies(id, this.templates(), this.store.patients()); }
  async deleteAllergy(id: string): Promise<boolean> {
    if (!this.canEdit || allergyInUse(this.allergyDeps(id))) return false;
    const out = this.allergies().filter((a) => a.id !== id);
    this.allergies.set(out);
    await this.put('allergyDefs', out);
    return true;
  }
  /** Irreversible: callers confirm first. Moves every patient record and template alert to the kept allergy. */
  async mergeAllergy(fromId: string, toId: string): Promise<number> {
    if (!this.canEdit) return 0;
    const r = mergeAllergies(this.allergies(), this.store.patients(), this.templates(), fromId, toId, new Date().toISOString());
    this.store.patients.set(r.patients);
    this.allergies.set(r.defs);
    this.templates.set(r.templates);
    await Promise.all([this.put('allergyDefs', r.defs), this.put('rxTemplates', r.templates)]);
    return r.moved;
  }

  /* templates */
  async saveTemplate(t: RxTemplate): Promise<void> {
    const list = this.templates();
    const next = list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t];
    this.templates.set(next);
    await this.put('rxTemplates', next);
  }
  async removeTemplate(id: string): Promise<void> {
    const next = this.templates().filter((x) => x.id !== id);
    this.templates.set(next);
    await this.put('rxTemplates', next);
  }

  /** Replaces all three lists at once (JSON import). Patients and prescriptions are not touched. */
  async replaceLibraries(meds: LibMedication[], allergies: AllergyDef[], templates: RxTemplate[]): Promise<void> {
    this.medications.set(meds); this.allergies.set(allergies); this.templates.set(templates);
    await Promise.all([this.put('medications', meds), this.put('allergyDefs', allergies), this.put('rxTemplates', templates)]);
  }
}
