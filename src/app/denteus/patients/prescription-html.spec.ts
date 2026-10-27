import { PrescriptionData, prescriptionHtml } from './prescription-html';

const base: PrescriptionData = {
  clinic: 'Clinic', dentist: 'Dr. Idrissi', patient: 'Sara', date: '24 Oct 2026', lang: 'en',
  lines: [{ drug: 'Amoxicillin', dosage: '1 g, twice a day', duration: '7 days' }, { drug: 'Paracetamol', dosage: '', duration: '' }],
  labels: { title: 'Prescription', patient: 'Patient', date: 'Date', dentist: 'Dentist', signature: 'Signature' },
};

describe('prescriptionHtml', () => {
  it('lists every line in order, with dose and duration when given', () => {
    const html = prescriptionHtml(base);
    expect(html.indexOf('1. Amoxicillin')).toBeLessThan(html.indexOf('2. Paracetamol'));
    expect(html).toContain('1 g, twice a day');
    expect(html).toContain('7 days');
  });
  it('escapes everything typed by staff', () => {
    const html = prescriptionHtml({ ...base, patient: '<script>x</script>', lines: [{ drug: '<b>Drug</b>', dosage: '"1"', duration: '&' }] });
    expect(html).not.toContain('<b>Drug');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('&quot;1&quot;');
  });
});
