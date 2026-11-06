import { letterHtml } from './letter-html';

describe('letterHtml', () => {
  it('escapes staff text and keeps line breaks', () => {
    const html = letterHtml({ clinic: '<c>', dentist: '', patient: '<script>x</script>', date: 'd', title: 't', lang: 'fr', details: ['a&b'], text: 'one\ntwo <b>', labels: { patient: 'p', date: 'd', signature: 's' } });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('one<br>two &lt;b&gt;');
    expect(html).toContain('a&amp;b');
  });
});
