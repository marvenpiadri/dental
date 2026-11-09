import { DEFAULT_TEMPLATE, DOC_KINDS, DocContent, DocTemplate, PRESETS, SectionId, normalizeTemplate, onAccent, renderDocument } from './doc-engine';

const doc = (over: Partial<DocContent> = {}): DocContent => ({
  kind: 'invoice', lang: 'en', dir: 'ltr', clinic: 'Clinic <One>', sender: ['Dr Amal'], title: 'Invoice', number: 'FA-1', subtitle: [],
  facts: [{ label: 'Patient', value: 'Sara' }], blocks: [{ type: 'table', head: ['Act', 'Price'], rows: [['Filling', 'MAD 300']], right: [1], foot: [['Total', 'MAD 300']] }],
  notes: ['Pay at the desk'], signature: 'Signature', ...over,
});
const at = (html: string, s: string) => html.indexOf(s);

describe('document engine', () => {
  it('gives Modern, Minimal and Bold their own look', () => {
    const [modern, minimal, bold] = PRESETS.map((t) => renderDocument(doc(), t, { preview: true }));
    expect(modern).toContain('border-bottom: 2px solid var(--a)');
    expect(bold).toContain('background: var(--a); color: var(--on)');
    expect(minimal).not.toContain('background: var(--a)');
    expect(new Set([modern, minimal, bold]).size).toBe(3);
  });

  it('escapes everything staff typed', () => {
    const html = renderDocument(doc({ title: '<script>x</script>' }), DEFAULT_TEMPLATE, { preview: true });
    expect(html).toContain('Clinic &lt;One&gt;');
    expect(html).not.toContain('<script>x');
  });

  it('follows the section order and hides what is switched off', () => {
    const t: DocTemplate = { ...DEFAULT_TEMPLATE, order: ['body', 'facts', 'sender', 'title', 'chart', 'notes', 'signature'], hidden: ['notes'] };
    const html = renderDocument(doc(), t, { preview: true });
    expect(at(html, 'Filling')).toBeLessThan(at(html, 'class="facts"'));
    expect(at(html, 'class="facts"')).toBeLessThan(at(html, 'class="top"'));
    expect(html).not.toContain('Pay at the desk');
  });

  it('puts the sender and the title opposite each other in one header row', () => {
    const html = renderDocument(doc(), DEFAULT_TEMPLATE, { preview: true });
    expect(html.match(/class="top"/g)).toHaveLength(1);
  });

  it('inserts the chart only where the template says so, at its place in the order', () => {
    const svg = '<svg id="chart"></svg>';
    expect(renderDocument(doc({ kind: 'invoice' }), DEFAULT_TEMPLATE, { chart: svg, preview: true })).not.toContain('id="chart"');
    const html = renderDocument(doc({ kind: 'report' }), DEFAULT_TEMPLATE, { chart: svg, preview: true });
    expect(html).toContain('id="chart"');
    const t: DocTemplate = { ...DEFAULT_TEMPLATE, chartKinds: ['report'], order: ['chart', ...DEFAULT_TEMPLATE.order.filter((s): s is SectionId => s !== 'chart')] };
    const first = renderDocument(doc({ kind: 'report' }), t, { chart: svg, preview: true });
    expect(at(first, 'id="chart"')).toBeLessThan(at(first, 'class="top"'));
  });

  it('never puts the tooth chart on a financial document, whatever the template says', () => {
    const svg = '<svg id="chart"></svg>', all: DocTemplate = { ...DEFAULT_TEMPLATE, chartKinds: [...DOC_KINDS], hidden: [] };
    for (const kind of ['invoice', 'receipt', 'statement', 'prescription'] as const) expect(renderDocument(doc({ kind }), all, { chart: svg, preview: true })).not.toContain('id="chart"');
    for (const kind of ['report', 'letter', 'quote'] as const) expect(renderDocument(doc({ kind }), all, { chart: svg, preview: true })).toContain('id="chart"');
  });

  it('drops financial kinds from a saved template when it is read back', () => {
    expect(normalizeTemplate({ id: 'x', name: 'Old', chartKinds: ['invoice', 'receipt', 'report', 'statement'] })!.chartKinds).toEqual(['report']);
  });

  it('prints with the page size and opens the print dialog; the preview does not', () => {
    const a5 = renderDocument(doc(), { ...DEFAULT_TEMPLATE, paper: 'a5' });
    expect(a5).toContain('size: A5');
    expect(a5).toContain('window.print()');
    expect(renderDocument(doc(), DEFAULT_TEMPLATE, { preview: true })).not.toContain('window.print()');
  });

  it('shows the clinic logo, header and footer text only when set', () => {
    const logo = 'data:image/png;base64,AAAA';
    const html = renderDocument(doc(), { ...DEFAULT_TEMPLATE, logo, headerNote: 'Open 9–18', footerNote: 'Thank you' }, { preview: true });
    expect(html).toContain(`<img src="${logo}"`);
    expect(html).toContain('Open 9–18');
    expect(html).toContain('Thank you');
    expect(renderDocument(doc(), { ...DEFAULT_TEMPLATE, logo, showLogo: false }, { preview: true })).not.toContain('<img');
  });

  it('reads the text colour for the accent band', () => {
    expect(onAccent('#0a0a0a')).toBe('#ffffff');
    expect(onAccent('#f5f5f5')).toBe('#0a0a0a');
  });

  it('repairs a damaged stored template instead of failing', () => {
    expect(normalizeTemplate(null)).toBeNull();
    const t = normalizeTemplate({ id: 'x', name: 'Mine', style: 'neon', accent: 'red', order: ['notes', 'notes', 'nope'], hidden: ['title', 'zzz'], logo: 'javascript:alert(1)', chartKinds: ['report', 'x'] })!;
    expect(t.style).toBe('minimal');
    expect(t.accent).toBe('#0a0a0a');
    expect(t.order[0]).toBe('notes');
    expect(new Set(t.order).size).toBe(7);
    expect(t.hidden).toEqual(['title']);
    expect(t.logo).toBeUndefined();
    expect(t.chartKinds).toEqual(['report']);
  });
});
