// One renderer for every printed document. A document says WHAT it contains (DocContent); a template says HOW it looks
// and which sections appear in which order (DocTemplate). Nothing here knows about invoices or patients.

export type DocKind = 'invoice' | 'quote' | 'receipt' | 'statement' | 'prescription' | 'report' | 'letter';
export const DOC_KINDS: readonly DocKind[] = ['invoice', 'quote', 'receipt', 'statement', 'prescription', 'report', 'letter'];

export type SectionId = 'sender' | 'title' | 'facts' | 'body' | 'chart' | 'notes' | 'signature';
/** The only documents that may carry the tooth chart: a clinical report, a referral letter and a treatment plan. Invoices, receipts, statements and prescriptions never do. */
export const CHART_KINDS: readonly DocKind[] = ['report', 'letter', 'quote'];
export const SECTIONS: readonly SectionId[] = ['sender', 'title', 'facts', 'body', 'chart', 'notes', 'signature'];

export type DocStyle = 'modern' | 'minimal' | 'bold';
export const DOC_STYLES: readonly DocStyle[] = ['modern', 'minimal', 'bold'];
export type DocFont = 'sans' | 'serif';
export type DocPaper = 'a4' | 'a5' | 'letter';

export interface DocTemplate {
  id: string;
  name: string;
  style: DocStyle;
  /** Hex colour of the title rule, the Bold band and the totals. Black by default. */
  accent: string;
  font: DocFont;
  paper: DocPaper;
  /** The clinic's own logo as a data URL; none means the document carries no logo. */
  logo?: string;
  showLogo: boolean;
  headerNote: string;
  footerNote: string;
  /** Every section exactly once; `hidden` switches some off without losing their place. */
  order: SectionId[];
  hidden: SectionId[];
  /** Kinds of document that carry the tooth chart in their `chart` section. */
  chartKinds: DocKind[];
  builtin?: boolean;
}

export type DocBlock =
  | { type: 'table'; head: string[]; rows: string[][]; right?: number[]; foot?: string[][] }
  | { type: 'rows'; rows: { label: string; value: string; strong?: boolean }[] }
  | { type: 'list'; items: string[] }
  | { type: 'text'; text: string }
  | { type: 'heading'; text: string; note?: string };

export interface DocContent {
  kind: DocKind;
  lang: string;
  dir: 'ltr' | 'rtl';
  clinic: string;
  /** Lines under the clinic name: the dentist, address, phone. */
  sender: string[];
  title: string;
  number?: string;
  /** Lines under the title (what a credit note cancels, who a letter goes to). */
  subtitle: string[];
  /** Patient, dates and other label/value facts shown together. */
  facts: { label: string; value: string }[];
  blocks: DocBlock[];
  notes: string[];
  /** Label of the signature line; none means no signature section. */
  signature?: string;
  chartTitle?: string;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Staff-typed text ends up inside HTML, so it is always escaped. */
export const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const BASE_ORDER: SectionId[] = ['sender', 'title', 'facts', 'body', 'chart', 'notes', 'signature'];
const preset = (id: DocStyle, name: string, font: DocFont): DocTemplate => ({
  id, name, style: id, accent: '#0a0a0a', font, paper: 'a4', showLogo: true, headerNote: '', footerNote: '',
  order: [...BASE_ORDER], hidden: [], chartKinds: ['report'], builtin: true,
});
export const PRESETS: readonly DocTemplate[] = [preset('modern', 'Modern', 'sans'), preset('minimal', 'Minimal', 'sans'), preset('bold', 'Bold', 'sans')];
export const DEFAULT_TEMPLATE: DocTemplate = PRESETS[1];

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const MAX_LOGO = 400_000;

/** Reads a stored template and repairs anything odd, so a damaged row never breaks printing. */
export function normalizeTemplate(raw: unknown): DocTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<DocTemplate>;
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string') return null;
  const seen = new Set<SectionId>();
  const order = [...(Array.isArray(r.order) ? r.order : []), ...SECTIONS].filter((s): s is SectionId => (SECTIONS as readonly string[]).includes(s) && !seen.has(s) && !!seen.add(s));
  return {
    id: r.id, name: r.name.slice(0, 40) || 'Template',
    style: DOC_STYLES.includes(r.style as DocStyle) ? (r.style as DocStyle) : 'minimal',
    accent: HEX.test(r.accent ?? '') ? r.accent! : '#0a0a0a',
    font: r.font === 'serif' ? 'serif' : 'sans',
    paper: r.paper === 'a5' || r.paper === 'letter' ? r.paper : 'a4',
    logo: typeof r.logo === 'string' && r.logo.length <= MAX_LOGO && LOGO.test(r.logo) ? r.logo : undefined,
    showLogo: r.showLogo !== false,
    headerNote: String(r.headerNote ?? '').slice(0, 300), footerNote: String(r.footerNote ?? '').slice(0, 300),
    order,
    hidden: (Array.isArray(r.hidden) ? r.hidden : []).filter((s): s is SectionId => (SECTIONS as readonly string[]).includes(s)),
    chartKinds: (Array.isArray(r.chartKinds) ? r.chartKinds : []).filter((k): k is DocKind => CHART_KINDS.includes(k as DocKind)),
  };
}

/** Black or white, whichever reads better on the accent (the Bold band and totals use it for text). */
export function onAccent(hex: string): '#0a0a0a' | '#ffffff' {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.6 ? '#0a0a0a' : '#ffffff';
}

const PAGE = { a4: 'A4', a5: 'A5', letter: 'Letter' } as const;
const WIDTH = { a4: 760, a5: 540, letter: 780 } as const;
const FONT = { sans: 'system-ui, "Segoe UI", Roboto, sans-serif', serif: 'Georgia, "Times New Roman", serif' } as const;

function css(t: DocTemplate): string {
  const on = onAccent(t.accent);
  const common = `
  :root { --a: ${t.accent}; --on: ${on}; --ink: #0a0a0a; --mut: #555; --line: #ccc; }
  @page { size: ${PAGE[t.paper]}; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 14px/1.55 ${FONT[t.font]}; color: var(--ink); margin: 0 auto; padding: 32px; max-width: ${WIDTH[t.paper]}px; }
  section, .top { margin: 0 0 20px; } .muted { color: var(--mut); }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; } .top > * { margin: 0; }
  .sender { flex: 1; } .brand { display: flex; align-items: center; gap: 10px; } .brand img { max-height: 44px; max-width: 160px; object-fit: contain; }
  .clinic { font-size: 17px; font-weight: 700; margin: 0; } .sender p { margin: 0; color: var(--mut); } .header-note { margin-top: 6px; font-size: 12px; }
  .title { text-align: end; } .title h1 { margin: 0; font-size: 22px; } .title p { margin: 2px 0 0; color: var(--mut); }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px 24px; }
  .facts div { display: flex; flex-direction: column; } .facts span { font-size: 12px; color: var(--mut); } .facts strong { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 12px; } th { text-align: start; font-weight: 600; padding: 8px 6px; } td { padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .n { text-align: end; font-variant-numeric: tabular-nums; } tfoot td { font-weight: 700; border-bottom: 0; }
  h2 { font-size: 15px; margin: 18px 0 4px; } ul.list { margin: 0; padding-inline-start: 18px; } .text { margin: 0 0 8px; }
  .chart { break-inside: avoid; } .chart svg { display: block; width: 100%; max-width: 300px; margin: 0 auto; height: auto; }
  .notes p { margin: 0 0 4px; font-size: 12px; color: var(--mut); } .footer { margin-top: 28px; padding-top: 8px; font-size: 12px; color: var(--mut); text-align: center; }
  .sign { margin-top: 48px; text-align: end; color: var(--mut); } .sign span { display: inline-block; min-width: 190px; border-top: 1px solid var(--ink); padding-top: 4px; }
  @media print { body { padding: 0; max-width: none; } }`;
  if (t.style === 'modern') return common + `
  .top { border-bottom: 2px solid var(--a); padding-bottom: 14px; } .title h1 { color: var(--a); }
  th { background: #f1f1f1; } th:first-child { border-radius: 6px 0 0 6px; } th:last-child { border-radius: 0 6px 6px 0; }
  tfoot td { border-top: 2px solid var(--a); } .rows td strong { color: var(--a); }`;
  if (t.style === 'bold') return common + `
  .top { background: var(--a); color: var(--on); padding: 22px 26px; margin-bottom: 24px; } .top .sender p, .top .title p { color: var(--on); opacity: .85; }
  .title h1 { font-size: 32px; font-weight: 800; letter-spacing: -.01em; } .clinic { font-size: 19px; }
  th { border-bottom: 3px solid var(--a); } tfoot td { border-top: 3px solid var(--a); } .facts strong { font-size: 15px; }`;
  return common + `
  .top { border-bottom: 1px solid var(--line); padding-bottom: 16px; } .title h1 { font-size: 20px; font-weight: 500; }
  th { color: var(--mut); font-size: 12px; font-weight: 500; border-bottom: 1px solid var(--ink); } tfoot td { border-top: 1px solid var(--ink); }`;
}

const cell = (v: string, i: number, right: number[], tag: 'td' | 'th') => `<${tag}${right.includes(i) ? ' class="n"' : ''}>${esc(v)}</${tag}>`;

function block(b: DocBlock): string {
  switch (b.type) {
    case 'table': {
      const right = b.right ?? [];
      return `<table><thead><tr>${b.head.map((h, i) => cell(h, i, right, 'th')).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((v, i) => cell(v, i, right, 'td')).join('')}</tr>`).join('')}</tbody>${b.foot?.length ? `<tfoot>${b.foot.map((r) => `<tr>${r.map((v, i) => cell(v, i, right, 'td')).join('')}</tr>`).join('')}</tfoot>` : ''}</table>`;
    }
    case 'rows': return `<table class="rows"><tbody>${b.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${r.strong ? `<strong>${esc(r.value)}</strong>` : esc(r.value)}</td></tr>`).join('')}</tbody></table>`;
    case 'list': return `<ul class="list">${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'text': return `<p class="text">${esc(b.text).replace(/\r?\n/g, '<br>')}</p>`;
    case 'heading': return `<h2>${esc(b.text)}</h2>${b.note ? `<p class="muted">${esc(b.note)}</p>` : ''}`;
  }
}

export interface RenderOptions {
  /** The tooth chart as an SVG string; the chart section is left out without it. */
  chart?: string;
  /** The preview shows the document without opening the print dialog. */
  preview?: boolean;
}

export function renderDocument(c: DocContent, t: DocTemplate = DEFAULT_TEMPLATE, o: RenderOptions = {}): string {
  const senderHtml = `<div class="sender"><div class="brand">${t.showLogo && t.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}<p class="clinic">${esc(c.clinic)}</p></div>${c.sender.filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}${t.headerNote ? `<p class="header-note">${esc(t.headerNote)}</p>` : ''}</div>`;
  const titleHtml = `<div class="title"><h1>${esc(c.title)}${c.number ? ` N° ${esc(c.number)}` : ''}</h1>${c.subtitle.filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
  const shown = (s: SectionId): boolean => !t.hidden.includes(s) && (s !== 'chart' || (!!o.chart && CHART_KINDS.includes(c.kind) && t.chartKinds.includes(c.kind)))
    && (s !== 'signature' || !!c.signature) && (s !== 'notes' || c.notes.some(Boolean)) && (s !== 'facts' || c.facts.some((f) => f.value));
  const order = t.order.filter(shown);
  const out: string[] = [];
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    const next = order[i + 1];
    if ((s === 'sender' && next === 'title') || (s === 'title' && next === 'sender')) { // the two sit opposite each other in one header row
      out.push(`<div class="top">${s === 'sender' ? senderHtml + titleHtml : titleHtml + senderHtml}</div>`); i++; continue;
    }
    if (s === 'sender') out.push(`<div class="top">${senderHtml}</div>`);
    else if (s === 'title') out.push(`<div class="top">${titleHtml}</div>`);
    else if (s === 'facts') out.push(`<section class="facts">${c.facts.filter((f) => f.value).map((f) => `<div><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong></div>`).join('')}</section>`);
    else if (s === 'body') out.push(`<section>${c.blocks.map(block).join('')}</section>`);
    else if (s === 'chart') out.push(`<section class="chart">${c.chartTitle ? `<h2>${esc(c.chartTitle)}</h2>` : ''}${o.chart}</section>`);
    else if (s === 'notes') out.push(`<section class="notes">${c.notes.filter(Boolean).map((n) => `<p>${esc(n)}</p>`).join('')}</section>`);
    else out.push(`<p class="sign"><span>${esc(c.signature ?? '')}</span></p>`);
  }
  if (t.footerNote) out.push(`<p class="footer">${esc(t.footerNote)}</p>`);
  return `<!doctype html><html lang="${esc(c.lang)}" dir="${c.dir}"><head><meta charset="utf-8"><title>${esc(c.title)}${c.number ? ' ' + esc(c.number) : ''}</title><style>${css(t)}</style></head><body>
${out.join('\n')}
${o.preview ? '' : `<script>window.addEventListener('load', function () { window.print(); });</script>`}
</body></html>`;
}
