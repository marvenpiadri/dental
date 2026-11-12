import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { ClinicDatabase } from '../services/clinic-database.service';
import { DentalStore } from '../services/dental-store.service';
import { InsuranceProvider, customProblem, parseCatalog } from './insurance';

/** Insurers a patient can be linked to: the reference list for the clinic's country (Morocco only for now), fetched when first needed, plus the clinic's own additions. */
@Injectable({ providedIn: 'root' })
export class InsuranceCatalog {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly db = inject(ClinicDatabase);
  private readonly store = inject(DentalStore);
  private readonly auth = inject(AuthService);
  private readonly reference = signal<InsuranceProvider[]>([]);
  private fetched: string | null = null;
  readonly custom = signal<InsuranceProvider[]>([]);
  readonly all = computed(() => [...this.reference(), ...this.custom()]);

  /** Loads what the country has (an empty reference list elsewhere) and the clinic's own providers. Safe to call again. */
  async ensure(): Promise<void> {
    if (!this.browser) return;
    const stored = await this.db.loadSetting<unknown>('insuranceProviders').catch(() => undefined);
    this.custom.set(Array.isArray(stored) ? parseCatalog({ entries: stored }).map((p) => ({ ...p, custom: true })) : []);
    const code = this.store.locations()[0]?.countryCode?.toUpperCase();
    const file = code === 'MA' ? 'MA' : null; // shortcut: Morocco is the only catalogue in this release; add codes here as other countries are written
    if (file === this.fetched) return;
    this.fetched = file;
    this.reference.set([]);
    if (!file) return;
    try { const r = await fetch(`insurance/${file}.json`); if (r.ok) this.reference.set(parseCatalog(await r.json())); else this.fetched = null; } catch { this.fetched = null; }
  }

  /** Adds a clinic-specific provider and returns it, or why it was refused. */
  async addCustom(name: string): Promise<InsuranceProvider | 'name' | 'duplicate' | 'denied'> {
    if (!this.auth.can('patients.edit')) return 'denied';
    const problem = customProblem(name, this.all());
    if (problem) return problem;
    const p: InsuranceProvider = { id: crypto.randomUUID(), name: name.trim().slice(0, 120), kind: 'other', custom: true };
    const next = [...this.custom(), p];
    this.custom.set(next);
    await this.db.saveSetting('insuranceProviders', next.map(({ custom: _c, ...x }) => x));
    return p;
  }
}
