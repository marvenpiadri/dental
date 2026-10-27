import type { Lang } from '../../core/i18n/i18n.service';
import { esc } from '../patients/receipt-html';
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

export function reportHtml(r: ReportData): string {
  const table = (rows: ReportRow[]) => rows.length
    ? `<table>${rows.map((x) => `<tr><th>${esc(x.tooth)}</th><td>${x.items.map(esc).join(' · ')}</td></tr>`).join('')}</table>`
    : `<p class="muted">${esc(r.labels.none)}</p>`;
  const section = (title: string, note: string, body: string) => `<h2>${esc(title)}</h2>${note ? `<p class="muted">${esc(note)}</p>` : ''}${body}`;
  return `<!doctype html><html lang="${esc(r.lang)}" dir="${r.dir}"><head><meta charset="utf-8"><title>${esc(r.labels.title)} – ${esc(r.patient)}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; color: #0a0a0a; margin: 0; padding: 32px; max-width: 760px; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #555; margin: 24px 0 6px; }
  .clinic { font-size: 16px; font-weight: 700; margin: 0 0 16px; } .muted { color: #555; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; } th { width: 64px; text-align: start; vertical-align: top; padding: 6px 0; border-top: 1px solid #ccc; } td { padding: 6px 0; border-top: 1px solid #ccc; }
  ul { margin: 0; padding-inline-start: 18px; } @media print { body { padding: 0; } }
</style></head><body>
<p class="clinic">${esc(r.clinic)}</p><h1>${esc(r.labels.title)}</h1>
<p class="muted">${esc(r.labels.patient)}: ${esc(r.patient)} · ${esc(r.labels.date)}: ${esc(r.date)}</p>
${section(r.labels.findings, '', table(r.findings))}
${section(r.labels.planned, r.labels.plannedNote, table(r.planned))}
${section(r.labels.suggested, r.labels.suggestedNote, r.suggested.length ? `<ul>${r.suggested.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : `<p class="muted">${esc(r.labels.none)}</p>`)}
${r.summary.length ? section(r.labels.summary, '', `<p>${r.summary.map(esc).join(' · ')}</p>`) : ''}
<script>window.addEventListener('load', function () { window.print(); });</script>
</body></html>`;
}
