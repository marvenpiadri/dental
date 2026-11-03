import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { I18n, type Key } from '../../core/i18n/i18n.service';
import { ALL_TEETH, WISDOM_TEETH, isBlankTooth, newChart, readChart, writeChart, type Chart, type ChartPayload, type ToothRecord } from './engine/chart';
import type { ToothEdit } from './engine/edits';
import { exportFhir, exportJson, importFhir, importJson } from './engine/io';
import { compareExaminations, makeExamination, suggestedDiagnoses, type Examination, type SuggestedDiagnosis } from './engine/exam';
import { editChart, plannedTeeth, setEdentulous, type ChartMode } from './engine/plan';
import { defaultState } from './engine/vendor/state/payload';
import { label } from './labels';
import { findingRows, planRows, reportHtml } from './chart-report';
import { indexSummary, perioSummary } from './engine/perio';
import { NUMBERING_SYSTEMS, formatTooth, primaryOf, type NumberingSystem } from './engine/numbering';
import { patchCaseMeta, type CaseMeta } from './engine/perio';
import { PerioGraphComponent } from './perio-graph.component';
import { PerioSummaryComponent } from './perio-summary.component';
import { PerioEditorComponent } from './perio-editor.component';
import { ToothEditorComponent } from './tooth-editor.component';
import { ToothFilesComponent } from './tooth-files.component';
import { DentalStore } from '../services/dental-store.service';
import { Tooth3dComponent } from './tooth-3d.component';
import { type CubeSurface } from './surface-cube.component';
import { CrownTopComponent } from './crown-top.component';
import { ToothTileComponent } from './tooth-tile.component';

const NUMBERING_KEY = 'dentaleus.numbering';
function storedNumbering(): NumberingSystem {
  try { return NUMBERING_SYSTEMS.find((s) => s === localStorage.getItem(NUMBERING_KEY)) ?? 'fdi'; } catch { return 'fdi'; }
}

type Tab = 'perio' | 'findings' | 'history';
interface Pending { edit: ToothEdit | 'edentulous'; teeth: number[]; diverging: number[] }

/**
 * The patient's dental chart. Holds this patient's chart and nothing global: a new patient means a new
 * component instance (the parent keys it by patient id), so no state can leak between patients.
 * Saves the engine's plain-JSON payload after every accepted edit; history is explicit examination records.
 */
@Component({
  selector: 'den-dental-chart',
  imports: [PerioGraphComponent, ToothFilesComponent, ToothTileComponent, CrownTopComponent, Tooth3dComponent, ToothEditorComponent, PerioEditorComponent, PerioSummaryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dental-chart.component.html',
  styleUrl: './dental-chart.component.css',
})
export class DentalChartComponent {
  private readonly i18n = inject(I18n);
  protected readonly store = inject(DentalStore);
  protected readonly t = this.i18n.t;

  readonly patientId = input.required<string>();
  /** Stored chart payload for this patient (undefined = never charted). */
  readonly raw = input<unknown>(undefined);
  /** For the printed report only. */
  readonly patientName = input('');
  readonly clinicName = input('');
  readonly examinations = input<readonly Examination[]>([]);
  /** History view: nothing can be edited, side and top views are shown together. Editing lives in the act editor. */
  readonly readonlyView = input(false);
  readonly hideSaveExam = input(false);
  readonly selection = output<readonly number[]>();
  readonly save = output<ChartPayload>();
  readonly examSave = output<Examination>();

  protected readonly source = computed(() => (this.raw() == null ? { chart: newChart(), issues: [] } : readChart(this.raw())));
  /** An unreadable stored chart is never overwritten: the chart stays locked until someone looks at it. */
  protected readonly locked = computed(() => this.source().chart === null);
  protected readonly chart = linkedSignal<Chart>(() => this.source().chart ?? newChart());
  protected readonly mode = signal<ChartMode>('status');
  protected readonly numberings = NUMBERING_SYSTEMS;
  protected readonly numbering = signal<NumberingSystem>(storedNumbering());
  protected setNumbering(v: string): void {
    const s = NUMBERING_SYSTEMS.find((x) => x === v) ?? 'fdi';
    this.numbering.set(s);
    try { localStorage.setItem(NUMBERING_KEY, s); } catch { /* preference only; private mode just forgets it */ }
  }
  protected num(n: number): string { return formatTooth(String(this.shown().status.get(n)?.toothSelection) === 'milktooth' ? primaryOf(n) : n, this.numbering()); }
  protected numLabel(s: NumberingSystem): Key { return `dc.num.${s}`; }
  protected readonly selected = signal<readonly number[]>([]);
  private readonly emitSelection = effect(() => this.selection.emit(this.selected()));
  protected readonly tab = signal<Tab>('findings');
  protected readonly pending = signal<Pending | null>(null);
  protected readonly notice = signal('');
  protected readonly viewing = signal<Examination | null>(null);
  protected readonly comparing = signal<Examination | null>(null);
  protected readonly issuesOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly examDate = signal('');
  protected readonly examExaminer = signal('');
  protected readonly examNote = signal('');

  protected readonly tabs: { id: Tab; key: Key; icon: string }[] = [{ id: 'perio', key: 'dc.tab.perio', icon: 'fa-chart-line' }, { id: 'findings', key: 'dc.tab.findings', icon: 'fa-stethoscope' }, { id: 'history', key: 'dc.tab.history', icon: 'fa-clock-rotate-left' }]
  protected tabCount(id: Tab): number { return id === 'findings' ? this.diagnoses().filter((d) => !this.isConfirmed(d)).length : id === 'history' ? this.examinations().length : 0; };
  protected readonly views = computed(() => [this.occlusalView()]);
  protected readonly upper = ALL_TEETH.slice(0, 16);
  protected readonly lower = ALL_TEETH.slice(16);
  /** What is drawn: a saved examination (read-only) or the working chart. */
  protected readonly shown = computed<Chart>(() => {
    const v = this.viewing();
    return v ? (readChart(v.chart).chart ?? this.chart()) : this.chart();
  });
  protected readonly readOnly = computed(() => this.locked() || this.viewing() !== null || this.readonlyView());
  /** Wisdom teeth can be hidden for a cleaner chart, but never when something is recorded on them. */
  /** Display only, per browser: not part of the chart. */
  protected readonly occlusalView = signal(false);

  protected hiddenTooth(n: number): boolean {
    const c = this.chart();
    return !c.globals.wisdomVisible && WISDOM_TEETH.includes(n) && isBlankTooth(c, n);
  }
  protected setGlobal(key: 'wisdomVisible' | 'showHealthyPulp' | 'showBase', on: boolean): void {
    if (this.readOnly()) return;
    const next = { ...this.chart(), globals: { ...this.chart().globals, [key]: on } };
    this.chart.set(next);
    this.save.emit(writeChart(next));
  }
  protected readonly planned = computed(() => plannedTeeth(this.chart()));
  protected readonly firstSelected = computed(() => this.selected()[0] ?? null);
  protected readonly firstState = computed<ToothRecord | null>(() => {
    const n = this.firstSelected();
    return n === null ? null : this.stateOf(n);
  });
  protected readonly diagnoses = computed<SuggestedDiagnosis[]>(() => suggestedDiagnoses(this.shown()));
  protected readonly dismissed = computed(() => {
    const out: { tooth: number; key: string }[] = [];
    for (const [n, s] of this.shown().status) for (const [key, mode] of s.dxOverrides as Map<string, string>) if (mode === 'suppress') out.push({ tooth: n, key });
    return out;
  });
  protected readonly diff = computed(() => {
    const other = this.comparing();
    return other ? compareExaminations(other, makeExamination(this.patientId(), this.chart(), { id: 'working', date: '9999-12-31' })) : null;
  });
  protected readonly issues = computed(() => this.source().issues);

  protected stateOf(n: number): ToothRecord {
    const c = this.shown();
    return (this.mode() === 'plan' ? c.plan?.get(n) : null) ?? c.status.get(n) ?? defaultState();
  }
  protected findingsOf(n: number): ToothRecord | null { return this.mode() === 'plan' ? (this.shown().status.get(n) ?? null) : null; }
  protected isPlanned(n: number): boolean { return this.planned().includes(n); }
  protected toothLabel(n: number): string { return `${this.num(n)}${this.isPlanned(n) ? ' · ' + this.t('dc.planned') : ''}`; }
  protected name(code: string): string { return label(code, this.i18n.lang()); }
  protected today(): string { return new Date().toISOString().slice(0, 10); }

  protected pick(n: number, ev: MouseEvent): void {
    const cur = this.selected();
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey) this.selected.set(cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]);
    else this.selected.set([n]);
    this.open3d.set(ev.ctrlKey || ev.metaKey || ev.shiftKey ? null : n); // a plain click opens the tooth; Shift/Ctrl builds a group to edit together
    this.areas.set([]);
  }
  /** The teeth the overlay edits: the whole group when the open tooth belongs to it. */
  protected editTeeth(): readonly number[] { const n = this.open3d(); return n !== null && this.selected().includes(n) ? this.selected() : n === null ? [] : [n];
    this.areas.set([]);
  }
  /** The tooth shown in the 3D overlay; closing it leaves the selection alone. */
  protected readonly open3d = signal<number | null>(null);
  protected readonly pulp3d = signal(false);
  /** How far the 3D tooth is pulled apart into its surfaces and horns (0 = whole). */
  protected readonly explode3d = signal(0);
  /** Areas picked in the 3D view: crown surfaces and thirds of the root. */
  protected readonly areas = signal<readonly string[]>([]);
  protected readonly hovered3d = signal<string | null>(null);
  /** The roots of the open tooth, reported by the 3D view (a molar has up to three). */
  /** The colour key of the realistic chart; the shader uses the same values. */
  protected readonly legend = [
    ['#8c0d1a', 'caries'], ['#6b7890', 'amalgam'], ['#29b8d9', 'composite'], ['#9fd640', 'glass'], ['#f580ad', 'temporary'], ['#bfd9f2', 'sealant'],
    ['#b3d1f7', 'crown'], ['#c29eeb', 'bridge'], ['#9eebe0', 'veneer'], ['#fac773', 'inlay'], ['#e63333', 'extraction'], ['#ff8c1a', 'replace'], ['#4080f2', 'needed'],
    ['#e6739b', 'resorption'], ['#d9626b', 'pulp'], ['#a1101f', 'pulpitis'], ['#3a3a3a', 'necrosis'], ['#e49aa6', 'endo'],
  ] as const;
  protected legendName(k: string): string { return this.t(`dc.lg.${k}` as 'dc.lg.title'); }
  protected readonly roots3d = signal<{ slot: number; key: string }[]>([]);
  /** A zone clicked on a top-view tile: it cycles clean → caries → filling like the cube faces. */
  protected pickSurface(n: number, id: string): void { this.selected.set([n]); this.cube(n, id as CubeSurface); }
  protected pickArea(id: string, additive: boolean): void {
    const cur = this.areas();
    this.areas.set(additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : cur.length === 1 && cur[0] === id ? [] : [id]);
  }
  /** Dental names for this tooth: front teeth have an incisal edge and a labial face, upper teeth a palatal face. */
  protected readonly areaNames = computed<Record<string, string>>(() => {
    const n = this.open3d() ?? 0, front = n % 10 <= 3, upper = n < 30, t = this.t;
    const names: Record<string, string> = {
      occlusal: t(front ? 'dc.a.incisal' : 'dc.a.occlusal'), buccal: t(front ? 'dc.a.labial' : 'dc.a.buccal'), lingual: t(upper ? 'dc.a.palatal' : 'dc.a.lingual'),
      mesial: t('dc.a.mesial'), distal: t('dc.a.distal'), cervical: t('dc.a.cervical'),
    };
    const many = this.roots3d().length > 1;
    for (const r of this.roots3d()) names[`root-${r.slot}`] = many ? t(`dc.root.${r.key}` as 'dc.root.p') : t('dc.a.radicular');
    return names;
  });
  protected readonly areaText = computed(() => this.areas().map((a) => this.areaNames()[a] ?? a).join(' · '));
  protected selectCoronal(): void { this.areas.set(['occlusal', 'buccal', 'lingual', 'mesial', 'distal']); }
  protected selectRadicular(): void { this.areas.set(this.roots3d().map((r) => `root-${r.slot}`)); }
  protected readonly areaSurfaces = computed(() => this.areas().filter((a) => ['occlusal', 'buccal', 'lingual', 'mesial', 'distal'].includes(a)));
  protected readonly areaRoots = computed(() => this.areas().filter((a) => a.startsWith('root-')));
  /** Selected roots that are fractured / not (a fracture belongs to one root, so only whole roots are toggled). */
  protected readonly pickedRoots = computed(() => this.areas().filter((a) => a.startsWith('root-')).map((a) => Number(a.slice(5))));
  protected rootBroken(k: number): boolean { const n = this.open3d(); return n !== null && !!(this.stateOf(n) as unknown as Record<string, boolean>)[`brokenRoot${k}`]; }
  protected allBroken(): boolean { const ks = this.pickedRoots(); return ks.length > 0 && ks.every((k) => this.rootBroken(k)); }
  protected toggleBroken(): void {
    const n = this.open3d(); if (n === null) return;
    const ks = this.pickedRoots(), on = !this.allBroken();
    for (const k of ks) this.apply({ kind: 'flag', field: `brokenRoot${k}`, on } as ToothEdit, false, [n]);
  }
  /** Applies a condition to every selected area of the open tooth. */
  protected applyAreas(what: 'caries' | 'filling' | 'clean'): void {
    const n = this.open3d(); if (n === null) return;
    const t = this.stateOf(n);
    const to = (e: ToothEdit) => this.apply(e, false, [n]);
    for (const s of this.areaSurfaces()) {
      if (what === 'caries') { if (t.fillingSurfaces.has(s)) to({ kind: 'fillingSurface', surface: s, on: false }); to({ kind: 'caries', surface: s, on: true }); }
      else if (what === 'filling') {
        if (this.stateOf(n).fillingMaterial === 'none') to({ kind: 'fillingMaterial', value: 'composite' });
        to({ kind: 'caries', surface: s, on: false }); to({ kind: 'fillingSurface', surface: s, on: true });
      } else { to({ kind: 'caries', surface: s, on: false }); to({ kind: 'fillingSurface', surface: s, on: false }); }
    }
    // A horn is marked treated (green) or cleared; decay belongs to the crown surfaces.
    for (const k of this.pickedRoots()) {
      to({ kind: 'flag', field: `rootWork${k}`, on: what === 'filling' } as ToothEdit);
    }
  }
  /** Dated findings for the overlay's tooth, newest first. */
  protected readonly toothHistory = computed(() => {
    const n = this.open3d();
    if (n === null) return [];
    return [...this.examinations()].reverse().map((e) => {
      const r = readChart(e.chart).chart?.status.get(n);
      const f = r ? [...r.caries].map((c) => String(c).replace('caries-', '')) : [];
      const fl = r ? [...r.fillingSurfaces].map(String) : [];
      return { id: e.id, date: e.date, caries: f, fillings: fl, note: e.note ?? '' };
    });
  });
  /** Click a face: clean → caries → filling → clean. */
  protected cube(n: number, s: CubeSurface): void {
    const t = this.stateOf(n);
    const to = (e: ToothEdit) => this.apply(e, false, [n]);
    if (t.fillingSurfaces.has(s)) to({ kind: 'fillingSurface', surface: s, on: false });
    else if (t.caries.has('caries-' + s)) {
      if (t.fillingMaterial === 'none') to({ kind: 'fillingMaterial', value: 'composite' });
      to({ kind: 'caries', surface: s, on: false });
      to({ kind: 'fillingSurface', surface: s, on: true });
    } else to({ kind: 'caries', surface: s, on: true });
  }
  protected selectArch(teeth: readonly number[]): void { this.selected.set(teeth); }

  protected apply(edit: ToothEdit, confirmed = false, teeth: readonly number[] = this.selected()): void {
    if (this.readOnly() || !teeth.length) return;
    this.notice.set('');
    const out = editChart(this.chart(), this.mode(), teeth, edit, { confirmed });
    if (out.kind === 'confirm') { this.pending.set({ edit, teeth: [...teeth], diverging: out.teeth }); return; }
    this.pending.set(null);
    if (out.rejected.length) this.notice.set(out.rejected.map((r) => `${r.tooth}: ${r.reason}`).join(' · '));
    if (out.changed.length) { this.chart.set(out.chart); this.save.emit(writeChart(out.chart)); }
  }
  /** Full braces mode: bonded brackets, molar bands and one archwire on a whole arch (or both), or all removed. */
  protected braces(which: string): void {
    const teeth = which === 'upper' ? this.upper : which === 'lower' ? this.lower : this.upper.concat(this.lower);
    if (which) this.apply({ kind: 'enum', field: 'orthoAppliance', value: which === 'none' ? 'none' : 'braces' }, false, teeth);
  }
  protected edentulous(confirmed = false): void {
    if (this.readOnly()) return;
    const out = setEdentulous(this.chart(), this.mode(), { confirmed });
    if (out.kind === 'confirm') { this.pending.set({ edit: 'edentulous', teeth: [...ALL_TEETH], diverging: out.teeth }); return; }
    this.pending.set(null);
    if (out.changed.length) { this.chart.set(out.chart); this.save.emit(writeChart(out.chart)); }
  }
  protected confirmPending(): void {
    const p = this.pending();
    if (!p) return;
    if (p.edit === 'edentulous') this.edentulous(true); else this.apply(p.edit, true, p.teeth);
  }

  protected patchMeta(p: Partial<CaseMeta>): void {
    if (this.readOnly()) return;
    const next = patchCaseMeta(this.chart(), p);
    this.chart.set(next);
    this.save.emit(writeChart(next));
  }
  protected readonly incoming = signal<{ chart: Chart; issues: number } | null>(null);
  protected download(kind: 'json' | 'fhir'): void {
    const text = kind === 'json' ? exportJson(this.shown()) : exportFhir(this.shown());
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `dental-chart-${this.patientId()}.${kind === 'json' ? 'json' : 'fhir.json'}`; a.click();
    URL.revokeObjectURL(url);
  }
  protected printReport(): void {
    const t = this.t, c = this.shown(), lang = this.i18n.lang();
    const ps = perioSummary(c), ix = indexSummary(c);
    const summary = [
      ps.chartedSites ? `${t('dc.ps.sites', { n: ps.chartedSites })}` : '', ps.chartedSites ? `BOP ${ps.bopPercent}%` : '',
      ps.maxPd !== null ? t('dc.ps.maxPd', { n: ps.maxPd }) : '', ix.olearyPercent ? t('dc.ps.oleary', { n: ix.olearyPercent }) : '',
      ix.meanPi !== null ? t('dc.ps.pi', { n: ix.meanPi }) : '', ix.meanGi !== null ? t('dc.ps.gi', { n: ix.meanGi }) : '',
    ].filter(Boolean);
    const html = reportHtml({
      clinic: this.clinicName() || 'Dentaleus', patient: this.patientName(), date: this.viewing()?.date ?? new Date().toISOString().slice(0, 10), lang, dir: 'ltr',
      findings: findingRows(c, lang, undefined, (n) => this.num(n)), planned: this.viewing() ? [] : planRows(c, lang, (n) => this.num(n)),
      suggested: this.diagnoses().map((d) => `${this.num(d.tooth)} · ${d.display}${d.icd10 ? ` (${d.icd10})` : ''}`), summary,
      labels: { title: t('dc.report.title'), patient: t('dc.report.patient'), date: t('dc.report.date'), findings: t('dc.report.findings'), planned: t('dc.report.planned'), plannedNote: t('dc.report.plannedNote'),
        suggested: t('dc.report.suggested'), suggestedNote: t('dc.report.suggestedNote'), summary: t('dc.report.summary'), none: t('dc.report.none') },
    });
    const win = window.open('', '_blank');
    if (!win) return; // blocked pop-up: the browser shows its own notice
    win.document.write(html);
    win.document.close();
  }
  protected async pickFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.readOnly()) return;
    const text = await file.text();
    const r = text.includes('"resourceType"') ? importFhir(text) : importJson(text);
    if (!r.chart) { this.notice.set(this.t('dc.import.bad', { why: r.error ?? r.issues[0]?.message ?? '' })); return; }
    this.notice.set('');
    this.incoming.set({ chart: r.chart, issues: r.issues.length });
  }
  protected applyImport(): void {
    const inc = this.incoming();
    if (!inc) return;
    this.chart.set(inc.chart); this.save.emit(writeChart(inc.chart)); this.incoming.set(null); this.selected.set([]);
  }
  protected setDx(d: { tooth: number; key: string }, mode: 'add' | 'suppress' | null): void { this.apply({ kind: 'dxOverride', key: d.key, mode }, false, [d.tooth]); }
  protected isConfirmed(d: SuggestedDiagnosis): boolean {
    const o = this.shown().status.get(d.tooth)?.dxOverrides as Map<string, string> | undefined;
    return o?.get(d.key) === 'add';
  }

  protected openSave(): void { this.examDate.set(this.today()); this.saving.set(true); }
  protected saveExam(): void {
    const date = this.examDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || this.locked()) return;
    this.examSave.emit(makeExamination(this.patientId(), this.chart(), { id: crypto.randomUUID(), date, examiner: this.examExaminer().trim() || undefined, note: this.examNote().trim() || undefined }));
    this.saving.set(false); this.examNote.set('');
  }
  /** Read-only chart modes: the first saved examination, the chart as it is now, or the planned work. */
  protected setView(k: 'initial' | 'current' | 'plan'): void {
    if (k === 'initial') { const first = this.examinations()[0]; if (first) this.view(first); return; }
    this.view(null);
    this.mode.set(k === 'plan' ? 'plan' : 'status');
  }
  protected view(e: Examination | null): void { this.viewing.set(e); this.selected.set([]); this.pending.set(null); }
  protected inputValue(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected fieldDiff(v: unknown): string { const s = JSON.stringify(v); return s === undefined ? '–' : s.length > 40 ? s.slice(0, 37) + '…' : s; }
}
