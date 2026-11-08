import { newChart } from '../odontogram/engine/chart';
import { applyEdit } from '../odontogram/engine/edits';
import { OUTLINES } from './tooth-outlines';
import { CODES, chartSvg, toothCodes } from './chart-svg';

const label = (k: string) => `L-${k}`;
function sample() {
  const c = newChart();
  const edit = (n: number, e: Parameters<typeof applyEdit>[2]) => applyEdit(c.status.get(n)!, n, e);
  edit(16, { kind: 'caries', surface: 'occlusal', on: true });
  edit(26, { kind: 'fillingMaterial', value: 'composite' }); edit(26, { kind: 'fillingSurface', surface: 'mesial', on: true });
  edit(36, { kind: 'restoration', value: 'crown|emax' });
  edit(46, { kind: 'selection', value: 'none' });
  edit(11, { kind: 'flag', field: 'extractionPlan', on: true });
  return c;
}

describe('chart SVG', () => {
  it('draws every tooth with its FDI number', () => {
    const svg = chartSvg({ teeth: newChart().status, label, title: 'Chart' });
    for (const n of [18, 11, 21, 28, 48, 41, 31, 38]) expect(svg).toContain(`>${n}</text>`);
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('marks what was recorded and lists exactly those marks in the legend', () => {
    const svg = chartSvg({ teeth: sample().status, label, title: 'Chart' });
    expect(toothCodes(sample().status.get(36)!)).toContain('Cr');
    for (const k of ['caries', 'filling', 'Cr', 'X', 'Ex']) expect(svg).toContain(`L-${k}`);
    expect(svg.split('fill="url(#cs-hatch)"').length - 1).toBeGreaterThan(1); // the tooth itself, not only the legend swatch
    expect(svg).not.toContain('L-Im');
    expect(svg).not.toContain('L-Br');
  });

  it('stays readable in grayscale: only black, white and hatching, no colour', () => {
    const svg = chartSvg({ teeth: sample().status, label, title: 'Chart' });
    const colours = new Set((svg.match(/#[0-9a-f]{3,6}\b/gi) ?? []).map((c) => c.toLowerCase()));
    expect([...colours].sort()).toEqual(['#0a0a0a', '#fff']);
    expect(svg).not.toMatch(/rgb|hsl/i);
  });

  it('leaves out hidden teeth and uses the numbering it is given', () => {
    const svg = chartSvg({ teeth: newChart().status, label, title: 'Chart', hide: new Set([18, 28, 38, 48]), tooth: (n) => `T${n}` });
    expect(svg).not.toContain('>T18</text>');
    expect(svg).toContain('>T11</text>');
  });

  it('is empty by default: real crown outlines for all 32 teeth, nothing filled or hatched', () => {
    expect(Object.keys(OUTLINES).length).toBe(32);
    const svg = chartSvg({ teeth: newChart().status, label, title: 'Chart' });
    expect(svg).not.toMatch(/<path[^>]*fill="#0a0a0a"/);
    expect(svg).not.toContain('fill="url(#cs-hatch)"');
    expect(svg).toContain('url(#cs-band)');
  });

  it('has a code for every legend entry', () => {
    expect(new Set(CODES).size).toBe(CODES.length);
  });
});
