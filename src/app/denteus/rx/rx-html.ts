import { esc } from '../documents/doc-engine';
import { Prescription, RxItem, RxSnapshot } from '../models/dental.models';
import { clean, itemTitle } from './rx-rules';

export interface RxDocLabels {
  patient: string; date: string; registration: string; signature: string; stamp: string; number: string; voided: string; draft: string; birth: string;
  f: { dosage: string; route: string; frequency: string; duration: string; quantity: string; refills: string };
  corrects: string; reason: string;
}
export interface RxDocInput { rx: Pick<Prescription, 'status' | 'number' | 'issuedAt' | 'createdAt' | 'items' | 'notes' | 'voidReason' | 'correctionReason'>; snapshot: RxSnapshot; date: string; birth?: string; corrects?: string; labels: RxDocLabels; lang: string; preview?: boolean }

const line = (i: RxItem, l: RxDocLabels): string => {
  const facts = ([[l.f.dosage, i.dosage], [l.f.route, i.route], [l.f.frequency, i.frequency], [l.f.duration, i.duration], [l.f.quantity, i.quantity], [l.f.refills, i.refills]] as const)
    .filter(([, v]) => clean(v)).map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v!)}</span>`).join('');
  const sub = [i.brand, i.generic].map(clean).filter(Boolean).join(' / ');
  return `<li><div class="t">${esc(itemTitle(i))}${sub ? `<small> (${esc(sub)})</small>` : ''}</div>${facts ? `<div class="f">${facts}</div>` : ''}${clean(i.instructions) ? `<div class="i">${esc(i.instructions!).replace(/\r?\n/g, '<br>')}</div>` : ''}</li>`;
};

/** A4 prescription, black and white. Uses the snapshot frozen at issue, so later edits to the clinic, dentist or patient never change it. */
export function rxHtml(d: RxDocInput): string {
  const s = d.snapshot, l = d.labels;
  const logo = s.clinic.logo?.startsWith('data:image/') ? `<img class="logo" alt="" src="${esc(s.clinic.logo)}">` : '';
  const contact = [s.clinic.address, s.clinic.phone, s.clinic.email].map(clean).filter(Boolean).map((x) => esc(x!)).join('<br>');
  const mark = d.rx.status === 'voided' ? l.voided : d.rx.status === 'draft' ? l.draft : '';
  return `<!doctype html><html lang="${esc(d.lang)}"><head><meta charset="utf-8"><title>${esc(d.rx.number ?? l.draft)}</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#000;background:#fff;font:13px/1.45 Helvetica,Arial,sans-serif}
.page{position:relative;width:210mm;min-height:297mm;padding:16mm 18mm;margin:0 auto;display:flex;flex-direction:column}
header{display:flex;gap:14px;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:10px}.logo{max-height:22mm;max-width:40mm;object-fit:contain}
header h1{margin:0;font-size:18px}header p{margin:2px 0 0;font-size:11px}.who{margin-left:auto;text-align:right;font-size:12px}
.meta{display:flex;justify-content:space-between;gap:16px;margin:14px 0;font-size:12px;border:1px solid #000;padding:8px 10px}.meta b{font-weight:700}
ol{list-style:none;padding:0;margin:8px 0 0;counter-reset:n}li{counter-increment:n;padding:8px 0 8px 26px;border-bottom:1px solid #999;position:relative;break-inside:avoid}
li:before{content:counter(n)'.';position:absolute;left:0;font-weight:700}.t{font-weight:700;font-size:14px}.t small{font-weight:400;font-size:11px}
.f{display:flex;flex-wrap:wrap;gap:2px 16px;margin-top:2px}.f b{font-weight:600}.i{margin-top:2px;font-style:italic}
.notes{margin-top:12px}.sign{margin-top:auto;display:flex;gap:24px;padding-top:24mm}.sign div{flex:1;border-top:1px solid #000;padding-top:4px;font-size:11px;min-height:30mm}
.mark{position:absolute;top:110mm;left:0;right:0;text-align:center;font-size:54px;font-weight:700;letter-spacing:6px;opacity:.14;transform:rotate(-24deg);pointer-events:none}
.corr{font-size:11px;margin-top:8px}
</style></head><body><div class="page">${mark ? `<div class="mark">${esc(mark)}</div>` : ''}
<header>${logo}<div><h1>${esc(s.clinic.name)}</h1>${contact ? `<p>${contact}</p>` : ''}</div>
<div class="who"><b>${esc(s.dentist.name)}</b>${clean(s.dentist.specialty) ? `<br>${esc(s.dentist.specialty!)}` : ''}${clean(s.dentist.registration) ? `<br>${esc(l.registration)} ${esc(s.dentist.registration!)}` : ''}${clean(s.dentist.phone) ? `<br>${esc(s.dentist.phone!)}` : ''}</div></header>
<div class="meta"><div><b>${esc(l.patient)}</b> ${esc(s.patient.name)}${d.birth ? `<br>${esc(d.birth)}` : ''}${clean(s.patient.phone) ? `<br>${esc(s.patient.phone!)}` : ''}</div><div style="text-align:right"><b>${esc(l.date)}</b> ${esc(d.date)}${d.rx.number ? `<br><b>${esc(l.number)}</b> ${esc(d.rx.number)}` : ''}</div></div>
<ol>${d.rx.items.map((i) => line(i, l)).join('')}</ol>
${clean(d.rx.notes) ? `<p class="notes">${esc(d.rx.notes!).replace(/\r?\n/g, '<br>')}</p>` : ''}
${d.corrects ? `<p class="corr">${esc(l.corrects)}${clean(d.rx.correctionReason) ? `. ${esc(l.reason)}` : ''}</p>` : ''}
<div class="sign"><div>${esc(l.signature)}</div><div>${esc(l.stamp)}</div></div></div>
${d.preview ? '' : `<script>window.addEventListener('load', function () { window.print(); });</script>`}</body></html>`;
}
