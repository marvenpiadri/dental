import { invoiceHtml } from './invoice-html';

describe('invoiceHtml', () => {
  const base = { clinic: 'c', patient: 'p', number: 'FA-2026-0001', title: 'Invoice', date: 'd', lang: 'en', lines: [{ where: '', name: 'Filling', price: '500' }], total: '500', paid: '0', remaining: '500', legal: [], labels: { patient: 'p', date: 'd', where: 'w', act: 'a', price: 'pr', total: 't', paid: 'pd', remaining: 'r' } };
  it('prints the due date under the title only when there is one', () => {
    expect(invoiceHtml({ ...base, due: 'Due 15 Dec 2026' })).toContain('Due 15 Dec 2026');
    expect(invoiceHtml(base)).not.toContain('Due ');
  });
});
