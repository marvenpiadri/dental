import { quoteHtml } from './quote-html';

const labels = { title: 'Quote', patient: 'Patient', date: 'Date', tooth: 'Tooth', act: 'Treatment', price: 'Price', total: 'Total', note: 'Valid 30 days' };

describe('quoteHtml', () => {
  it('lists every line and escapes typed text', () => {
    const html = quoteHtml({ clinic: 'C', patient: '<b>Eve</b>', date: 'd', lines: [{ tooth: '11', name: 'Crown & cap', price: 'MAD 1' }], total: 'MAD 1', labels, lang: 'en' });
    expect(html).toContain('Crown &amp; cap');
    expect(html).toContain('&lt;b&gt;Eve');
    expect(html).not.toContain('<b>Eve');
  });
});
