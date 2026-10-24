import { PrescriptionLine } from '../models/dental.models';

export interface PrescriptionData {
  clinic: string;
  dentist: string;
  patient: string;
  date: string;
  lines: PrescriptionLine[];
  labels: { title: string; patient: string; date: string; dentist: string; signature: string };
  lang: string;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** A one-page prescription the browser prints. Drug names and doses are typed by staff, so everything is escaped. */
export function prescriptionHtml(r: PrescriptionData): string {
  const lines = r.lines
    .map((l, i) => `<li><strong>${i + 1}. ${esc(l.drug)}</strong>${l.dosage ? `<br>${esc(l.dosage)}` : ''}${l.duration ? ` <span class="muted">· ${esc(l.duration)}</span>` : ''}</li>`)
    .join('');
  return `<!doctype html><html lang="${esc(r.lang)}"><head><meta charset="utf-8"><title>${esc(r.labels.title)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; color: #0a0a0a; margin: 0; padding: 32px; max-width: 560px; }
  .clinic { font-size: 18px; font-weight: 700; margin: 0; } .dentist { margin: 0 0 24px; color: #555; }
  h1 { font-size: 20px; margin: 0 0 12px; } .meta { display: flex; justify-content: space-between; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 8px 0; margin-bottom: 20px; }
  ol { margin: 0; padding: 0; list-style: none; } li { padding: 10px 0; border-bottom: 1px dashed #ccc; } .muted { color: #555; }
  .sign { margin-top: 56px; text-align: end; color: #555; } .sign span { display: inline-block; min-width: 180px; border-top: 1px solid #0a0a0a; padding-top: 4px; }
  @media print { body { padding: 0; } }
</style></head><body>
<p class="clinic">${esc(r.clinic)}</p><p class="dentist">${esc(r.dentist)}</p>
<h1>${esc(r.labels.title)}</h1>
<div class="meta"><span>${esc(r.labels.patient)}: <strong>${esc(r.patient)}</strong></span><span>${esc(r.labels.date)}: ${esc(r.date)}</span></div>
<ol>${lines}</ol>
<p class="sign"><span>${esc(r.labels.signature)}</span></p>
<script>window.addEventListener('load', function () { window.print(); });</script>
</body></html>`;
}
