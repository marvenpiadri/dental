import { esc } from './receipt-html';

export interface StatementData {
  clinic: string; patient: string; insurer: string; number: string; date: string;
  lines: { date: string; tooth: string; name: string; price: string }[];
  total: string; lang: string;
  labels: { title: string; patient: string; insurer: string; number: string; date: string; tooth: string; act: string; price: string; total: string; note: string };
}

/** Care actually done (never planned work) and what was charged. Staff-typed text is escaped: it ends up inside HTML. */
export function statementHtml(s: StatementData): string {
  const meta = (label: string, value: string) => (value ? `<p class="meta">${esc(label)}: ${esc(value)}</p>` : '');
  return `<!doctype html><html lang="${esc(s.lang)}"><head><meta charset="utf-8"><title>${esc(s.labels.title)}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; color: #0a0a0a; margin: 0; padding: 32px; max-width: 720px; }
  h1 { font-size: 22px; margin: 0 0 8px; } .clinic { font-size: 16px; font-weight: 700; margin: 0 0 16px; } .meta { margin: 0; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; } th { text-align: start; font-size: 12px; color: #555; padding: 6px 8px 6px 0; border-bottom: 2px solid #0a0a0a; }
  td { padding: 6px 8px 6px 0; border-bottom: 1px solid #ccc; } td.n, th.n { text-align: end; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-bottom: 0; } .note { margin-top: 24px; color: #555; font-size: 12px; } @media print { body { padding: 0; } }
</style></head><body>
<p class="clinic">${esc(s.clinic)}</p><h1>${esc(s.labels.title)}</h1>
${meta(s.labels.patient, s.patient)}${meta(s.labels.insurer, s.insurer)}${meta(s.labels.number, s.number)}${meta(s.labels.date, s.date)}
<table><thead><tr><th>${esc(s.labels.date)}</th><th>${esc(s.labels.tooth)}</th><th>${esc(s.labels.act)}</th><th class="n">${esc(s.labels.price)}</th></tr></thead><tbody>
${s.lines.map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.tooth)}</td><td>${esc(l.name)}</td><td class="n">${esc(l.price)}</td></tr>`).join('\n')}
</tbody><tfoot><tr><td colspan="3">${esc(s.labels.total)}</td><td class="n">${esc(s.total)}</td></tr></tfoot></table>
<p class="note">${esc(s.labels.note)}</p>
<script>window.addEventListener('load', function () { window.print(); });</script>
</body></html>`;
}
