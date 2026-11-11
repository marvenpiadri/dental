import { Injectable, computed, inject, signal } from '@angular/core';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { ClinicDatabase } from '../services/clinic-database.service';
import { WISDOM_TEETH, isBlankTooth, newChart, readChart } from '../odontogram/engine/chart';
import { chartSvg } from './chart-svg';
import { DEFAULT_TEMPLATE, DOC_KINDS, DocKind, DocTemplate, PRESETS, normalizeTemplate, CHART_KINDS } from './doc-engine';

type Mode = 'status' | 'plan';

/** The clinic's saved document templates and which one each kind of document uses. */
@Injectable({ providedIn: 'root' })
export class Documents {
  private readonly db = inject(ClinicDatabase);
  private readonly i18n = inject(I18n);
  readonly custom = signal<DocTemplate[]>([]);
  readonly defaults = signal<Partial<Record<DocKind, string>>>({});
  readonly all = computed(() => [...PRESETS, ...this.custom()]);

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    const list = await this.db.loadSetting<unknown[]>('docTemplates').catch(() => undefined);
    this.custom.set((Array.isArray(list) ? list : []).map(normalizeTemplate).filter((t): t is DocTemplate => !!t));
    const d = await this.db.loadSetting<Record<string, string>>('docDefaults').catch(() => undefined);
    const defaults = Object.fromEntries(Object.entries(d ?? {}).filter(([k]) => DOC_KINDS.includes(k as DocKind)));
    this.defaults.set(defaults);
    // Drop retired document kinds from saved clinic preferences as well as from the UI.
    if (d && Object.keys(defaults).length !== Object.keys(d).length) await this.db.saveSetting('docDefaults', defaults);
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
    if (!CHART_KINDS.includes(kind) || !tpl.chartKinds.includes(kind)) return undefined;
    const chart = readChart(raw).chart ?? newChart(); // a patient with nothing recorded still gets the empty chart
    const teeth = mode === 'plan' ? chart?.plan : chart?.status;
    if (!chart || !teeth) return undefined;
    return chartSvg({
      teeth, hide: new Set(WISDOM_TEETH.filter((n) => isBlankTooth(chart, n))),
      title: this.i18n.t(mode === 'plan' ? 'doc.chart.plan' : 'doc.chart.status'),
      label: (k) => this.i18n.t(`cs.${k}` as Key),
    });
  }

  /** The chart on its own, for export: independent of templates and billing. `blank` draws an empty chart whatever is recorded. */
  standaloneChart(raw: unknown, blank = false): string {
    const chart = blank ? newChart() : (readChart(raw).chart ?? newChart());
    return chartSvg({
      teeth: chart.status, hide: blank ? undefined : new Set(WISDOM_TEETH.filter((n) => isBlankTooth(chart, n))), // a blank form shows all 32 teeth
      title: this.i18n.t('doc.chart.status'), label: (k) => this.i18n.t(`cs.${k}` as Key),
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

