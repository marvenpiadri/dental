import { esc } from './receipt-html';

export interface LetterData {
  clinic: string; dentist: string; patient: string; date: string; title: string; lang: string;
  /** Lines shown under the title: who the letter goes to, days of rest. */
  details: string[];
  text: string;
  labels: { patient: string; date: string; signature: string };
}

/** A certificate or referral letter the browser prints. Everything typed by staff is escaped; line breaks are kept. */
export function letterHtml(l: LetterData): string {
  const body = esc(l.text).replace(/\r?\n/g, '<br>');
  return `<!doctype html><html lang="${esc(l.lang)}"><head><meta charset="utf-8"><title>${esc(l.title)}</title>
<style>
  body { font: 15px/1.6 system-ui, sans-serif; color: #0a0a0a; margin: 0; padding: 32px; max-width: 600px; }
  .clinic { font-size: 18px; font-weight: 700; margin: 0; } .dentist { margin: 0 0 24px; color: #555; }
  h1 { font-size: 20px; margin: 0 0 12px; } .meta { display: flex; justify-content: space-between; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 8px 0; margin-bottom: 16px; }
  .detail { margin: 0 0 4px; font-weight: 600; } .text { margin: 20px 0 0; }
  .sign { margin-top: 56px; text-align: end; color: #555; } .sign span { display: inline-block; min-width: 180px; border-top: 1px solid #0a0a0a; padding-top: 4px; }
  @media print { body { padding: 0; } }
</style></head><body>
<p class="clinic">${esc(l.clinic)}</p><p class="dentist">${esc(l.dentist)}</p>
<h1>${esc(l.title)}</h1>
<div class="meta"><span>${esc(l.labels.patient)}: <strong>${esc(l.patient)}</strong></span><span>${esc(l.labels.date)}: ${esc(l.date)}</span></div>
${l.details.map((d) => `<p class="detail">${esc(d)}</p>`).join('')}
<p class="text">${body}</p>
<p class="sign"><span>${esc(l.labels.signature)}</span></p>
<script>window.addEventListener('load', function () { window.print(); });</script>
</body></html>`;
}
