// Examination records: one explicit, dated snapshot per visit. History is never rewritten by later edits.
import { readChart, writeChart, ALL_TEETH, type Chart, type ChartPayload } from './chart';
import { comparePerioExams, type PerioExamComparison } from './vendor/state/examCompare';
import { deriveDentalDiagnoses } from './vendor/dx/derive';
import { DX_CODES, type DiagnosisKey } from './vendor/dx/codes';

export interface Examination {
  id: string;
  patientId: string;
  /** ISO date (yyyy-mm-dd) of the clinical exam. */
  date: string;
  examiner?: string;
  note?: string;
  /** Frozen payload (status findings, plan, case metadata). */
  chart: ChartPayload;
}

export function makeExamination(patientId: string, chart: Chart, meta: { id: string; date: string; examiner?: string; note?: string }): Examination {
  return { patientId, ...meta, chart: structuredClone(writeChart(chart)) };
}

/** Newest first; ties broken by id so ordering is stable. */
export function sortExaminations(list: readonly Examination[]): Examination[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/** Only examinations that belong to `patientId` — the guard against cross-patient leakage. */
export function examinationsOf(patientId: string, all: readonly Examination[] | undefined): Examination[] {
  return sortExaminations((all ?? []).filter((e) => e.patientId === patientId));
}

export interface ToothChange { tooth: number; fields: { field: string; from: unknown; to: unknown }[] }
export interface ExamDiff { teeth: ToothChange[]; perio: PerioExamComparison }

/** What changed between two examinations (status findings only; the plan is not a finding). */
export function compareExaminations(from: Examination, to: Examination): ExamDiff {
  const teeth: ToothChange[] = [];
  for (const n of ALL_TEETH) {
    const a = from.chart.teeth[String(n)] as unknown as Record<string, unknown> | undefined;
    const b = to.chart.teeth[String(n)] as unknown as Record<string, unknown> | undefined;
    const fields: ToothChange['fields'] = [];
    for (const f of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
      if (JSON.stringify(a?.[f]) !== JSON.stringify(b?.[f])) fields.push({ field: f, from: a?.[f], to: b?.[f] });
    }
    if (fields.length) teeth.push({ tooth: n, fields });
  }
  return { teeth, perio: comparePerioExams(from.chart, to.chart) };
}

export interface SuggestedDiagnosis { tooth: number; key: DiagnosisKey; icd10?: string; display: string }
/** Diagnoses *suggested* by the recorded findings. Never confirmed: the clinician decides (use dxOverride add/suppress). */
export function suggestedDiagnoses(chart: Chart): SuggestedDiagnosis[] {
  return deriveDentalDiagnoses(writeChart(chart)).map((d) => ({
    tooth: Number(d.toothNo), key: d.key, icd10: DX_CODES[d.key].icd10, display: DX_CODES[d.key].icd10Display,
  }));
}

/** Loads an examination's frozen chart (validated, with issues) — e.g. to start a new exam from the last one. */
export const loadExamination = (e: Examination) => readChart(e.chart);
