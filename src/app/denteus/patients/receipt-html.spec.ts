import { ReceiptData, receiptHtml } from './receipt-html';

const base: ReceiptData = {
  clinic: 'Clinic', patient: 'Sara', number: 'A1B2C3', date: '23 Oct 2026', method: 'Cash', amount: 'MAD 500', charged: 'MAD 2,500', paid: 'MAD 500', due: 'MAD 2,000',
  labels: { title: 'Receipt', patient: 'Patient', date: 'Date', method: 'Method', amount: 'Amount received', charged: 'Charged', paid: 'Paid', due: 'Balance due', thanks: 'Thank you' },
  lang: 'en', dir: 'ltr',
};

describe('receiptHtml', () => {
  it('shows the amounts and the patient', () => {
    const html = receiptHtml(base);
    for (const text of ['Sara', 'MAD 500', 'MAD 2,000', 'A1B2C3']) expect(html).toContain(text);
  });
  it('escapes names so they cannot inject markup', () => {
    const html = receiptHtml({ ...base, patient: '<img src=x onerror=alert(1)> & "co"' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;co&quot;');
  });
});
