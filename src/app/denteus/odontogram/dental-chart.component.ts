import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { I18n, type Key } from '../../core/i18n/i18n.service';
import { ALL_TEETH, newChart, readChart, writeChart, type Chart, type ChartPayload, type ToothRecord } from './engine/chart';
import type { ToothEdit } from './engine/edits';
import { compareExaminations, makeExamination, suggestedDiagnoses, type Examination, type SuggestedDiagnosis } from './engine/exam';
import { editChart, plannedTeeth, setEdentulous, type ChartMode } from './engine/plan';
import { defaultState } from './engine/vendor/state/payload';
import { label } from './labels';
import { PerioEditorComponent } from './perio-editor.component';
import { ToothEditorComponent } from './tooth-editor.component';
import { ToothTileComponent } from './tooth-tile.component';

type Tab = 'tooth' | 'perio' | 'findings' | 'history';
interface Pending { edit: ToothEdit | 'edentulous'; teeth: number[]; diverging: number[] }

/**
 * The patient's dental chart. Holds this patient's chart and nothing global: a new patient means a new
 * component instance (the parent keys it by patient id), so no state can leak between patients.
 * Saves the engine's plain-JSON payload after every accepted edit; history is explicit examination records.
 */
@Component({
  selector: 'den-dental-chart',
  imports: [ToothTileComponent, ToothEditorComponent, PerioEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dental-chart.component.html',
  styleUrl: './dental-chart.component.css',
})
export class DentalChartComponent {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly patientId = input.required<string>();
  /** Stored chart payload for this patient (undefined = never charted). */
  readonly raw = input<unknown>(undefined);
  readonly examinations = input<readonly Examination[]>([]);
  readonly save = output<ChartPayload>();
  readonly examSave = output<Examination>();

  protected readonly source = computed(() => (this.raw() == null ? { chart: newChart(), issues: [] } : readChart(this.raw())));
  /** An unreadable stored chart is never overwritten: the chart stays locked until someone looks at it. */
  protected readonly locked = computed(() => this.source().chart === null);
  protected readonly chart = linkedSignal<Chart>(() => this.source().chart ?? newChart());
  protected readonly mode = signal<ChartMode>('status');
  protected readonly selected = signal<readonly number[]>([]);
  protected readonly tab = signal<Tab>('tooth');
  protected readonly pending = signal<Pending | null>(null);
  protected readonly notice = signal('');
  protected readonly viewing = signal<Examination | null>(null);
  protected readonly comparing = signal<Examination | null>(null);
  protected readonly issuesOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly examDate = signal('');
  protected readonly examExaminer = signal('');
  protected readonly examNote = signal('');

  protected readonly tabs: { id: Tab; key: Key }[] = [{ id: 'tooth', key: 'dc.tab.tooth' }, { id: 'perio', key: 'dc.tab.perio' }, { id: 'findings', key: 'dc.tab.findings' }, { id: 'history', key: 'dc.tab.history' }];
  protected readonly upper = ALL_TEETH.slice(0, 16);
  protected readonly lower = ALL_TEETH.slice(16);
  /** What is drawn: a saved examination (read-only) or the working chart. */
  protected readonly shown = computed<Chart>(() => {
    const v = this.viewing();
    return v ? (readChart(v.chart).chart ?? this.chart()) : this.chart();
  });
  protected readonly readOnly = computed(() => this.locked() || this.viewing() !== null);
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
  protected toothLabel(n: number): string { return `${n}${this.isPlanned(n) ? ' · ' + this.t('dc.planned') : ''}`; }
  protected name(code: string): string { return label(code, this.i18n.lang()); }
  protected today(): string { return new Date().toISOString().slice(0, 10); }

  protected pick(n: number, ev: MouseEvent): void {
    const cur = this.selected();
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey) this.selected.set(cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]);
    else this.selected.set(cur.length === 1 && cur[0] === n ? [] : [n]);
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
  protected view(e: Examination | null): void { this.viewing.set(e); this.selected.set([]); this.pending.set(null); }
  protected inputValue(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected fieldDiff(v: unknown): string { const s = JSON.stringify(v); return s === undefined ? '–' : s.length > 40 ? s.slice(0, 37) + '…' : s; }
}
