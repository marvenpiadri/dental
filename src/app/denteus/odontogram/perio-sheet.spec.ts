import { newChart } from './engine/chart';
import { editChart } from './engine/plan';
import { sheetRows } from './perio-sheet.component';

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
});
