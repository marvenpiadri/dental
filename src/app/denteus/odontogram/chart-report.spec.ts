import { newChart } from './engine/chart';
import { editChart } from './engine/plan';
import { findingRows, perioRows, planRows, reportHtml, type ReportData } from './chart-report';

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
      clinic: '<b>C</b>', patient: '<img src=x onerror=alert(1)>', date: 'd', lang: 'en', dir: 'ltr', findings: [{ tooth: '11', items: ['<script>x</script>'] }], planned: [], suggested: [], summary: [],
      labels: { title: 'Chart', patient: 'Patient', date: 'Date', findings: 'F', planned: 'P', plannedNote: 'n', suggested: 'S', suggestedNote: 'n', summary: 'Sum', none: 'None' },
    };
    const html = reportHtml(data);
    expect(html).not.toContain('<img');
    expect(html.match(/<script>/g)?.length).toBe(1); // only the print trigger
  });
});

describe('perio rows in the report', () => {
  const ok = (o: ReturnType<typeof editChart>) => { if (o.kind !== 'applied') throw new Error('not applied'); return o.chart; };
  it('is empty until something is probed, then counts depth and bleeding per tooth', () => {
    expect(perioRows(newChart())).toEqual([]);
    let c = ok(editChart(newChart(), 'status', [16], { kind: 'perio', site: 'MB', pd: 6 }));
    c = ok(editChart(c, 'status', [16], { kind: 'perio', site: 'B', pd: 3 }));
    c = ok(editChart(c, 'status', [16], { kind: 'perio', site: 'MB', bop: true }));
    expect(perioRows(c)).toEqual([{ tooth: '16', items: ['PD 6 mm', 'BOP 1/2'] }]);
  });
  it('prints the probing table and classification in the report', () => {
    const c = ok(editChart(newChart(), 'status', [16], { kind: 'perio', site: 'MB', pd: 6 }));
    const base = { clinic: 'C', patient: 'P', date: '2026-11-17', lang: 'en', dir: 'ltr' as const, findings: [], planned: [], suggested: [], summary: [], labels: { title: 'T', patient: 'P', date: 'D', findings: 'F', planned: 'Pl', plannedNote: '', suggested: 'S', suggestedNote: '', summary: 'Sum', none: 'None', perio: 'Periodontal chart' } };
    const html = reportHtml({ ...base, perio: perioRows(c), classification: 'Stage III' });
    expect(html).toContain('Periodontal chart');
    expect(html).toContain('PD 6 mm');
    expect(html).toContain('Stage III');
    expect(reportHtml(base)).not.toContain('Periodontal chart');
  });
});
