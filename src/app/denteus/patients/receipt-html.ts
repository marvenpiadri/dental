export interface ReceiptData {
  clinic: string;
  patient: string;
  number: string;
  date: string;
  method: string;
  amount: string;
  charged: string;
  paid: string;
  due: string;
  labels: { title: string; patient: string; date: string; method: string; amount: string; charged: string; paid: string; due: string; thanks: string };
  lang: string;
  dir: 'ltr' | 'rtl';
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** A single A5-friendly page the browser prints. Everything typed by staff is escaped: names end up inside HTML. */
export function receiptHtml(r: ReceiptData): string {
  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
  return `<!doctype html><html lang="${esc(r.lang)}" dir="${r.dir}"><head><meta charset="utf-8"><title>${esc(r.labels.title)} ${esc(r.number)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; color: #0a0a0a; margin: 0; padding: 32px; max-width: 520px; }
  h1 { font-size: 22px; margin: 0 0 4px; } .clinic { font-size: 18px; font-weight: 700; margin: 0 0 24px; }
  .meta { color: #555; margin: 0 0 20px; } table { width: 100%; border-collapse: collapse; }
  th { text-align: start; font-weight: 500; color: #555; padding: 8px 0; border-top: 1px solid #ccc; } td { text-align: end; padding: 8px 0; border-top: 1px solid #ccc; font-variant-numeric: tabular-nums; }
  tr.strong th, tr.strong td { font-size: 18px; font-weight: 700; color: #0a0a0a; border-top: 2px solid #0a0a0a; } .thanks { margin-top: 28px; color: #555; }
  @media print { body { padding: 0; } }
</style></head><body>
<p class="clinic">${esc(r.clinic)}</p>
<h1>${esc(r.labels.title)}</h1><p class="meta">N° ${esc(r.number)}</p>
<table>
${row(r.labels.patient, r.patient)}${row(r.labels.date, r.date)}${row(r.labels.method, r.method)}${row(r.labels.amount, r.amount, true)}
${row(r.labels.charged, r.charged)}${row(r.labels.paid, r.paid)}${row(r.labels.due, r.due)}
</table>
<p class="thanks">${esc(r.labels.thanks)}</p>
<script>window.addEventListener('load', function () { window.print(); });</script>
</body></html>`;
}
