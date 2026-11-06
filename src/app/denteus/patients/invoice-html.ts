import { esc } from './receipt-html';

export interface InvoiceData {
  clinic: string; patient: string; number: string; date: string; title: string;
  /** Shown under the title of a credit note: which invoice it cancels. */
  cancels?: string;
  lines: { where: string; name: string; price: string }[];
  /** Business name, tax number, bank details and note set in Settings; empty lines are skipped. */
  legal: string[];
  total: string; paid: string; remaining: string; lang: string;
  labels: { patient: string; date: string; where: string; act: string; price: string; total: string; paid: string; remaining: string };
}

/** One printable page. Staff-typed text is escaped: it ends up inside HTML. Payments are not processed here, only recorded. */
export function invoiceHtml(d: InvoiceData): string {
  const rows = d.lines.map((l) => `<tr><td>${esc(l.where)}</td><td>${esc(l.name)}</td><td class="n">${esc(l.price)}</td></tr>`).join('');
  const sum = (label: string, value: string, strong = false) => `<tr${strong ? ' class="strong"' : ''}><th colspan="2">${esc(label)}</th><td class="n">${esc(value)}</td></tr>`;
  return `<!doctype html><html lang="${esc(d.lang)}" dir="ltr"><head><meta charset="utf-8"><title>${esc(d.title)} ${esc(d.number)}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; color: #0a0a0a; margin: 0; padding: 32px; max-width: 720px; }
  h1 { font-size: 22px; margin: 0 0 4px; } .clinic { font-size: 18px; font-weight: 700; margin: 0 0 24px; } .meta { color: #555; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; } th { text-align: start; color: #555; font-weight: 600; padding: 8px 0; border-bottom: 1px solid #0a0a0a; }
  td { padding: 8px 0; border-bottom: 1px solid #ccc; } .n { text-align: end; font-variant-numeric: tabular-nums; }
  tfoot th { border-bottom: 1px solid #ccc; } tfoot tr.strong th, tfoot tr.strong td { font-size: 17px; font-weight: 700; color: #0a0a0a; border-bottom: 2px solid #0a0a0a; }
  .legal { margin: 24px 0 0; color: #555; font-size: 12px; } .legal + .legal { margin-top: 2px; }
  @media print { body { padding: 0; } }
</style></head><body>
<p class="clinic"><img src="/logo.png" alt="" width="28" height="28" style="vertical-align:middle;margin-inline-end:8px;border-radius:6px">${esc(d.clinic)}</p>
<h1>${esc(d.title)} N° ${esc(d.number)}</h1>${d.cancels ? `<p class="meta">${esc(d.cancels)}</p>` : ''}
<p class="meta">${esc(d.labels.date)}: ${esc(d.date)}</p><p class="meta">${esc(d.labels.patient)}: ${esc(d.patient)}</p>
<table><thead><tr><th>${esc(d.labels.where)}</th><th>${esc(d.labels.act)}</th><th class="n">${esc(d.labels.price)}</th></tr></thead><tbody>${rows}</tbody>
<tfoot>${sum(d.labels.total, d.total, true)}${sum(d.labels.paid, d.paid)}${sum(d.labels.remaining, d.remaining)}</tfoot></table>
${d.legal.filter(Boolean).map((l) => `<p class="legal">${esc(l)}</p>`).join('')}
<script>window.addEventListener('load', function () { window.print(); });</script>
</body></html>`;
}
