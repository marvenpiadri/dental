import { rxHtml, RxDocLabels } from './rx-html';

const labels: RxDocLabels = { patient: 'Patient', date: 'Date', registration: 'Reg.', signature: 'Signature', stamp: 'Stamp', number: 'No.', voided: 'VOID', draft: 'DRAFT', birth: 'Born {date}', f: { dosage: 'Dose', route: 'Route', frequency: 'Freq', duration: 'For', quantity: 'Qty', refills: 'Refills' }, corrects: 'Corrects RX-1', reason: 'Reason: typo' };
const base = { snapshot: { clinic: { name: 'Clinic <b>' }, dentist: { name: 'Dr A', registration: '123' }, patient: { name: 'Sam' } }, date: '2026-11-11', labels, lang: 'en', preview: true };

describe('rxHtml', () => {
  it('prints the frozen snapshot, escapes typed text and numbers the medications', () => {
    const html = rxHtml({ ...base, rx: { status: 'issued', number: 'RX-2026-0001', createdAt: '', items: [{ id: '1', name: 'Amox <i>', strength: '500 mg', dosage: '1 cap' }], notes: 'n' } });
    expect(html).toContain('Clinic &lt;b&gt;');
    expect(html).toContain('Amox &lt;i&gt; 500 mg');
    expect(html).toContain('RX-2026-0001');
    expect(html).toContain('Reg. 123');
    expect(html).not.toContain('class="mark"');
  });
  it('marks voided and draft copies and refuses a non-image logo', () => {
    const snap = { ...base.snapshot, clinic: { name: 'C', logo: 'javascript:alert(1)' } };
    const html = rxHtml({ ...base, snapshot: snap, rx: { status: 'voided', createdAt: '', items: [] } });
    expect(html).toContain('VOID');
    expect(html).not.toContain('<img');
    expect(rxHtml({ ...base, rx: { status: 'draft', createdAt: '', items: [] } })).toContain('DRAFT');
  });
});
