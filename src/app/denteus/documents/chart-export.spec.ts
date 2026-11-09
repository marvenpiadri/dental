import { newChart } from '../odontogram/engine/chart';
import { chartPageHtml } from './chart-export';
import { chartSvg } from './chart-svg';

describe('chart export', () => {
  const svg = chartSvg({ teeth: newChart().status, label: (k) => k, title: 'Chart' });
  it('is a single page that holds the chart, the patient and the date, and escapes what staff typed', () => {
    const html = chartPageHtml(svg, { title: 'Tooth chart', patient: '<b>Sara</b>', date: '2026-11-09', lang: 'en' });
    expect(html).toContain('<svg');
    expect(html).toContain('&lt;b&gt;Sara&lt;/b&gt; · 2026-11-09');
    expect(html).toContain('window.print()');
    expect(chartPageHtml(svg, { title: 't', patient: '', date: '', lang: 'en', preview: true })).not.toContain('window.print()');
  });
  it('draws all 32 teeth when blank, with no findings marked', () => {
    expect(svg.match(/>(1[1-8]|2[1-8]|3[1-8]|4[1-8])<\/text>/g)?.length).toBe(32);
  });
});
