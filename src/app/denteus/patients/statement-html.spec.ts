import { StatementData, statementHtml } from './statement-html';

const base: StatementData = {
  clinic: 'Clinic', patient: 'Sara', insurer: 'CNSS', number: '123', date: '27 Oct 2026', total: 'MAD 800', lang: 'en',
  lines: [{ date: '20 Oct', tooth: '16', name: 'Filling', price: 'MAD 800' }],
  labels: { title: 'Statement', patient: 'Patient', insurer: 'Insurer', number: 'No', date: 'Date', tooth: 'Tooth', act: 'Act', price: 'Fee', total: 'Total', note: 'Not an official form' },
};

describe('statementHtml', () => {
  it('lists the care, the total and the insurer', () => {
    const html = statementHtml(base);
    for (const t of ['Filling', 'MAD 800', 'CNSS', '123', 'Not an official form']) expect(html).toContain(t);
  });
  it('omits insurer lines when there is none and escapes typed text', () => {
    const html = statementHtml({ ...base, insurer: '', number: '', patient: '<img src=x onerror=1>' });
    expect(html).not.toContain('Insurer:');
    expect(html).not.toContain('<img');
  });
});
