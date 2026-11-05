import { newChart } from './engine/chart';
import { editChart } from './engine/plan';
import { chartViz, levelAt, pdChange, perioStats, pocketTone, toothViz } from './perio-viz';

function withPerio() {
  let c = newChart();
  const ap = (tooth: number, edit: Parameters<typeof editChart>[3]) => { const o = editChart(c, 'status', [tooth], edit, { confirmed: true }); if (o.kind === 'confirm') throw new Error('confirm'); c = o.chart; };
  ap(16, { kind: 'perio', site: 'B', pd: 5 }); ap(16, { kind: 'perio', site: 'B', gm: 2 }); ap(16, { kind: 'perio', site: 'B', bop: true });
  ap(16, { kind: 'perio', site: 'ML', pd: 3 }); ap(16, { kind: 'plaque', surface: 'mesial', on: true });
  ap(16, { kind: 'furcation', entrance: 'buccal', grade: 2 });
  return c;
}

describe('perio viz', () => {
  it('reads sites, keeping pocket depth and recession separate and deriving CAL', () => {
    const v = toothViz(withPerio(), 16)!, b = v.sites.find((s) => s.site === 'B')!;
    expect(b).toMatchObject({ pd: 5, gm: 2, cal: 7, bop: true });
    expect(v.sites.find((s) => s.site === 'ML')).toMatchObject({ pd: 3, gm: null, cal: 3, bop: false });
    expect(v.sites.find((s) => s.site === 'DB')!.cal).toBeNull(); // never invents a value
  });
  it('carries plaque, furcation and probed state from the chart', () => {
    const v = toothViz(withPerio(), 16)!;
    expect([...v.plaque]).toEqual(['mesial']);
    expect(v.furcation).toEqual([{ entrance: 'buccal', grade: 2, angle: 90 }]);
    expect(v.probed).toBe(true);
    expect(toothViz(newChart(), 11)!.probed).toBe(false);
  });
  it('lists only teeth that are present', () => { expect(chartViz(newChart()).length).toBeLessThanOrEqual(32); const o = editChart(newChart(), 'status', [16], { kind: 'selection', value: 'none' }, { confirmed: true });
    if (o.kind === 'confirm') throw new Error('confirm');
    expect(toothViz(o.chart, 16)).toBeNull(); expect(chartViz(o.chart).some((v) => v.tooth === 16)).toBe(false); });
  it('compares pocket depth with an earlier exam without inventing readings', () => {
    const now = withPerio(); let before = newChart();
    const o = editChart(before, 'status', [16], { kind: 'perio', site: 'B', pd: 2 }, { confirmed: true }); if (o.kind === 'confirm') throw new Error('confirm'); before = o.chart;
    expect(pdChange(toothViz(now, 16), toothViz(before, 16), 'B')).toBe(3);
    expect(pdChange(toothViz(now, 16), toothViz(before, 16), 'ML')).toBeNull();
    expect(perioStats(now, before)).toMatchObject({ sites: 2, pd4: 1, pd6: 0, worse: 1, bopPct: 50 });
  });
  it('tones pocket depth', () => { expect([3, 4, 5, 6].map(pocketTone)).toEqual(['shallow', 'watch', 'watch', 'deep']); });
  it('interpolates between sites and hits the site value at its own angle', () => {
    const v = toothViz(withPerio(), 16)!, pd = (s: { pd: number | null }) => s.pd;
    expect(levelAt(v, 90, pd)).toBe(5);
    expect(levelAt(v, 67.5, pd)).toBeCloseTo(2.5, 1);
    expect(levelAt(v, 0, pd)).toBeGreaterThanOrEqual(0);
  });
});
