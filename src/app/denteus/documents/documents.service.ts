import { Injectable, computed, inject, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { ClinicDatabase } from '../services/clinic-database.service';
import { WISDOM_TEETH, isBlankTooth, readChart } from '../odontogram/engine/chart';
import { ToothSnap } from '../odontogram/tooth-snap.service';
import { chartSvg } from './chart-svg';
import { ToothImages, toothImages } from './tooth-images';
import { DEFAULT_TEMPLATE, DOC_KINDS, DocKind, DocTemplate, PRESETS, normalizeTemplate } from './doc-engine';

type Mode = 'status' | 'plan';

/** The clinic's saved document templates and which one each kind of document uses. */
@Injectable({ providedIn: 'root' })
export class Documents {
  private readonly db = inject(ClinicDatabase);
  private readonly i18n = inject(I18n);
  readonly custom = signal<DocTemplate[]>([]);
  readonly defaults = signal<Partial<Record<DocKind, string>>>({});
  private readonly snap = inject(ToothSnap);
  /** The 3D tooth pictures, drawn once in the background the first time a chart is needed. */
  private readonly images = signal<ToothImages | undefined>(undefined);
  private started = false;
  readonly all = computed(() => [...PRESETS, ...this.custom()]);

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    const list = await this.db.loadSetting<unknown[]>('docTemplates').catch(() => undefined);
    this.custom.set((Array.isArray(list) ? list : []).map(normalizeTemplate).filter((t): t is DocTemplate => !!t));
    const d = await this.db.loadSetting<Record<string, string>>('docDefaults').catch(() => undefined);
    this.defaults.set(Object.fromEntries(Object.entries(d ?? {}).filter(([k]) => DOC_KINDS.includes(k as DocKind))));
  }

  /** The template a document of this kind prints with; Minimal when none was chosen or the chosen one was deleted. */
  templateFor(kind: DocKind): DocTemplate {
    return this.all().find((t) => t.id === this.defaults()[kind]) ?? DEFAULT_TEMPLATE;
  }

  async save(t: DocTemplate): Promise<void> {
    const kept = this.custom().filter((x) => x.id !== t.id);
    const next = [...kept, { ...t, builtin: undefined }];
    this.custom.set(next);
    await this.db.saveSetting('docTemplates', next);
  }

  async remove(id: string): Promise<void> {
    const next = this.custom().filter((x) => x.id !== id);
    this.custom.set(next);
    await this.db.saveSetting('docTemplates', next);
    if (Object.values(this.defaults()).includes(id)) await this.setDefaults(Object.fromEntries(Object.entries(this.defaults()).filter(([, v]) => v !== id)));
  }

  async setDefault(kind: DocKind, id: string): Promise<void> { await this.setDefaults({ ...this.defaults(), [kind]: id }); }

  private async setDefaults(d: Partial<Record<DocKind, string>>): Promise<void> {
    this.defaults.set(d);
    await this.db.saveSetting('docDefaults', d);
  }

  /** The chart picture for a document, or nothing when this template does not carry it or the patient has no readable chart. */
  chartFor(kind: DocKind, tpl: DocTemplate, raw: unknown, mode: Mode = 'status'): string | undefined {
    if (!tpl.chartKinds.includes(kind) || raw == null) return undefined;
    const chart = readChart(raw).chart;
    const teeth = mode === 'plan' ? chart?.plan : chart?.status;
    if (!chart || !teeth) return undefined;
    if (!this.started && typeof window !== 'undefined') { this.started = true; void toothImages(this.snap).then((m) => this.images.set(m)).catch(() => { this.started = false; }); }
    return chartSvg({
      images: this.images(), teeth, hide: new Set(WISDOM_TEETH.filter((n) => isBlankTooth(chart, n))),
      title: this.i18n.t(mode === 'plan' ? 'doc.chart.plan' : 'doc.chart.status'),
      label: (k) => this.i18n.t(`cs.${k}` as Key),
    });
  }

  /** Opens the document in a new tab, which prints itself. Silent when the browser blocks the pop-up. */
  print(html: string): void {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}

