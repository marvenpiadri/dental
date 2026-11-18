import { esc } from './doc-engine';

/** A plain one-page print of the chart picture, with no clinic template. It prints itself unless `preview`. */
export function chartPageHtml(svg: string, o: { title: string; patient: string; date: string; lang: string; clinic?: string; logo?: string; preview?: boolean }): string {
  return `<!doctype html><html lang="${esc(o.lang)}"><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>
@page { size: A4 portrait; }
body { font: 14px system-ui, sans-serif; color: #0a0a0a; margin: 0; }
h1 { font-size: 18px; margin: 0 0 4px; } p { margin: 0 0 16px; color: #444; }
header { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; } header img { max-height: 44px; max-width: 160px; object-fit: contain; } header b { font-size: 16px; }
svg { display: block; width: 100%; max-width: 560px; margin: 0 auto; height: auto; }
</style></head><body>${o.clinic || o.logo ? `<header>${o.logo ? `<img src="${esc(o.logo)}" alt="">` : ''}<b>${esc(o.clinic ?? '')}</b></header>` : ''}<h1>${esc(o.title)}</h1><p>${[o.patient, o.date].filter(Boolean).map(esc).join(' · ')}</p>${svg}
${o.preview ? '' : `<script>window.addEventListener('load', function () { window.print(); });</script>`}</body></html>`;
}
