import { esc } from './receipt-html';

export interface QuoteData {
  clinic: string;
  patient: string;
  date: string;
  lines: { tooth: string; name: string; price: string }[];
  total: string;
  labels: { title: string; patient: string; date: string; tooth: string; act: string; price: string; total: string; note: string };
  lang: string;
}

/** A printable quote (devis) for the planned work. Everything typed by staff is escaped. */
export function quoteHtml(q: QuoteData): string {
  const rows = q.lines.map((l) => `<tr><td>${esc(l.tooth)}</td><td>${esc(l.name)}</td><td class="n">${esc(l.price)}</td></tr>`).join('');
  return `<!doctype html><html lang="${esc(q.lang)}"><head><meta charset="utf-8"><title>${esc(q.labels.title)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; color: #0a0a0a; margin: 0; padding: 32px; max-width: 700px; }
  h1 { font-size: 22px; margin: 0 0 4px; } .clinic { font-size: 18px; font-weight: 700; margin: 0 0 24px; } .meta { color: #555; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; } th { text-align: start; color: #555; font-weight: 500; padding: 8px 6px; border-bottom: 2px solid #0a0a0a; }
  td { padding: 8px 6px; border-bottom: 1px solid #ccc; } .n, th.n { text-align: end; font-variant-numeric: tabular-nums; }
  tfoot td { font-size: 18px; font-weight: 700; border-bottom: 0; border-top: 2px solid #0a0a0a; } .note { margin-top: 28px; color: #555; }
  @media print { body { padding: 0; } }
</style></head><body>
<p class="clinic">${esc(q.clinic)}</p><h1>${esc(q.labels.title)}</h1>
<p class="meta">${esc(q.labels.patient)}: ${esc(q.patient)} · ${esc(q.labels.date)}: ${esc(q.date)}</p>
<table><thead><tr><th>${esc(q.labels.tooth)}</th><th>${esc(q.labels.act)}</th><th class="n">${esc(q.labels.price)}</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td></td><td>${esc(q.labels.total)}</td><td class="n">${esc(q.total)}</td></tr></tfoot></table>
<p class="note">${esc(q.labels.note)}</p>
<script>window.addEventListener('load', function () { window.print(); });</script>
</body></html>`;
}
