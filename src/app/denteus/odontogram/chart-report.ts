import type { Lang } from '../../core/i18n/i18n.service';
import { DEFAULT_TEMPLATE, DocBlock, DocContent, DocTemplate, renderDocument } from '../documents/doc-engine';
import { ALL_TEETH, newChart, writeChart, type Chart } from './engine/chart';
import { plannedTeeth } from './engine/plan';
import { label } from './labels';

export interface ReportRow { tooth: string; items: string[] }

const words = (field: string) => field.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, (c) => c.toUpperCase());

function show(v: unknown, lang: Lang): string {
  if (typeof v === 'string') return label(v, lang);
  if (Array.isArray(v)) return v.map((x) => show(x, lang)).join(', ');
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${label(k, lang)} ${show(x, lang)}`).join(', ');
  return String(v);
}

/** Every recorded value that differs from a blank tooth, one line each. Generic on purpose: nothing is interpreted, so nothing can be mis-stated. */
export function findingRows(chart: Chart, lang: Lang, teeth: readonly number[] = ALL_TEETH, tooth: (n: number) => string = String): ReportRow[] {
  const blank = writeChart(newChart()).teeth;
  const mine = writeChart(chart).teeth;
  const rows: ReportRow[] = [];
  for (const n of teeth) {
    const a = mine[String(n)] as unknown as Record<string, unknown> | undefined;
    const b = blank[String(n)] as unknown as Record<string, unknown> | undefined;
    const items: string[] = [];
    for (const f of Object.keys(a ?? {})) {
      if (JSON.stringify(a?.[f]) === JSON.stringify(b?.[f])) continue;
      items.push(a![f] === true ? words(f) : `${words(f)}: ${show(a![f], lang)}`);
    }
    if (items.length) rows.push({ tooth: tooth(n), items });
  }
  return rows;
}

/** Teeth whose planned state differs from the findings, shown as a plan (never as work done). */
export function planRows(chart: Chart, lang: Lang, tooth: (n: number) => string = String): ReportRow[] {
  if (!chart.plan) return [];
  return findingRows({ ...chart, status: chart.plan }, lang, plannedTeeth(chart), tooth);
}

export interface ReportData {
  clinic: string; patient: string; date: string; lang: string; dir: 'ltr' | 'rtl';
  findings: ReportRow[]; planned: ReportRow[]; suggested: string[]; summary: string[];
  labels: { title: string; patient: string; date: string; findings: string; planned: string; plannedNote: string; suggested: string; suggestedNote: string; summary: string; none: string };
}

export function reportDoc(r: ReportData): DocContent {
  const rows = (list: ReportRow[]): DocBlock => list.length
    ? { type: 'table', head: [], rows: list.map((x) => [x.tooth, x.items.join(' · ')]) }
    : { type: 'text', text: r.labels.none };
  const blocks: DocBlock[] = [
    { type: 'heading', text: r.labels.findings }, rows(r.findings),
    { type: 'heading', text: r.labels.planned, note: r.labels.plannedNote }, rows(r.planned),
    { type: 'heading', text: r.labels.suggested, note: r.labels.suggestedNote }, r.suggested.length ? { type: 'list', items: r.suggested } : { type: 'text', text: r.labels.none },
  ];
  if (r.summary.length) blocks.push({ type: 'heading', text: r.labels.summary }, { type: 'text', text: r.summary.join(' · ') });
  return {
    kind: 'report', lang: r.lang, dir: r.dir, clinic: r.clinic, sender: [], title: r.labels.title, subtitle: [],
    facts: [{ label: r.labels.patient, value: r.patient }, { label: r.labels.date, value: r.date }], blocks, notes: [], chartTitle: undefined,
  };
}
export const reportHtml = (r: ReportData, tpl: DocTemplate = DEFAULT_TEMPLATE, chart?: string): string => renderDocument(reportDoc(r), tpl, { chart });
