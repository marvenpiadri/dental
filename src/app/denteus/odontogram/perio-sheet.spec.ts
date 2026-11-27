import { newChart } from './engine/chart';
import { editChart } from './engine/plan';
import { sheetRows } from './perio-sheet.component';
import { toothViz } from './perio-viz';

describe('perio sheet rows', () => {
  it('lists present teeth only and carries probed depths, recession and bleeding', () => {
    let c = newChart();
    const ok = (o: ReturnType<typeof editChart>) => { if (o.kind !== 'applied') throw new Error('confirm'); return o.chart; };
    c = ok(editChart(c, 'status', [16], { kind: 'perio', site: 'MB', pd: 6 }));
    c = ok(editChart(c, 'status', [16], { kind: 'perio', site: 'MB', gm: 2, bop: true }));
    c = ok(editChart(c, 'status', [36], { kind: 'selection', value: 'none' }));
    const rows = sheetRows(c);
    expect(rows.find((r) => r.tooth === 36)).toBeUndefined();
    const mb = rows.find((r) => r.tooth === 16)!.sites.find((s) => s.site === 'MB')!;
    expect(mb).toEqual({ site: 'MB', pd: 6, gm: 2, bop: true });
    expect(rows.find((r) => r.tooth === 16)!.sites).toHaveLength(6);
  });

  it('lists an implant with its probing, flagged, but leaves it out of the 3D view', () => {
    let c = newChart();
    const ok = (o: ReturnType<typeof editChart>) => { if (o.kind !== 'applied') throw new Error('confirm'); return o.chart; };
    c = ok(editChart(c, 'status', [46], { kind: 'selection', value: 'implant' }));
    c = ok(editChart(c, 'status', [46], { kind: 'perio', site: 'DB', pd: 5 }));
    c = ok(editChart(c, 'status', [46], { kind: 'perio', site: 'DB', bop: true, sup: true }));
    const row = sheetRows(c).find((r) => r.tooth === 46)!;
    expect(row.implant).toBe(true);
    expect(row.sites.find((s) => s.site === 'DB')).toEqual({ site: 'DB', pd: 5, gm: null, bop: true });
    expect(sheetRows(c).find((r) => r.tooth === 16)!.implant).toBeUndefined();
    expect(toothViz(c, 46)).toBeNull();
    expect(toothViz(c, 16)).not.toBeNull();
  });
  it('keeps the probing when a probed natural tooth is replaced by an implant', () => {
    let c = newChart();
    const ok = (o: ReturnType<typeof editChart>) => { if (o.kind !== 'applied') throw new Error('confirm'); return o.chart; };
    c = ok(editChart(c, 'status', [36], { kind: 'perio', site: 'MB', pd: 4 }));
    const sw = editChart(c, 'status', [36], { kind: 'selection', value: 'implant' });
    expect(sw.kind === 'applied' ? sheetRows(sw.chart).find((r) => r.tooth === 36)!.sites.find((s) => s.site === 'MB')!.pd : 'needs confirm').toBe(4);
  });
});
