import { newChart } from './engine/chart';
import { editChart } from './engine/plan';
import { findingRows, planRows, reportHtml, type ReportData } from './chart-report';

const crown = (chart: ReturnType<typeof newChart>, mode: 'status' | 'plan', n: number) => {
  const o = editChart(chart, mode, [n], { kind: 'restoration', value: 'crown|emax' });
  if (o.kind !== 'applied') throw new Error('confirm');
  return o.chart;
};

describe('chart report', () => {
  it('lists only what differs from a blank tooth', () => {
    expect(findingRows(newChart(), 'en')).toEqual([]);
    const rows = findingRows(crown(newChart(), 'status', 11), 'en');
    expect(rows.map((r) => r.tooth)).toEqual(['11']);
    expect(rows[0]!.items.join(' ')).toContain('Crown');
  });
  it('keeps a planned crown out of the findings and in the plan', () => {
    const c = crown(newChart(), 'plan', 26);
    expect(findingRows(c, 'en')).toEqual([]);
    expect(planRows(c, 'en').map((r) => r.tooth)).toEqual(['26']);
  });
  it('escapes everything typed by staff', () => {
    const data: ReportData = {
      clinic: '<b>C</b>', patient: '<img src=x onerror=alert(1)>', date: 'd', lang: 'en', dir: 'ltr', findings: [{ tooth: '11', items: ['<script>x</script>'] }], planned: [], suggested: [],
      labels: { title: 'Chart', patient: 'Patient', date: 'Date', findings: 'F', planned: 'P', plannedNote: 'n', suggested: 'S', suggestedNote: 'n', none: 'None' },
    };
    const html = reportHtml(data);
    expect(html).not.toContain('<img');
    expect(html.match(/<script>/g)?.length).toBe(1); // only the print trigger
  });
});

describe('probing and the printed report', () => {
  it('keeps probing out of the findings list', () => {
    const o = editChart(newChart(), 'status', [16], { kind: 'perio', site: 'MB', pd: 6 });
    if (o.kind !== 'applied') throw new Error('not applied');
    expect(findingRows(o.chart, 'en')).toEqual([]);
  });
});
