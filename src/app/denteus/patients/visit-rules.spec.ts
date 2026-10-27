import { noteContent, usableLines } from './visit-rules';

const blank = { complaint: '', findings: '', care: '', lines: [] };

describe('noteContent', () => {
  it('refuses a note that says nothing', () => {
    expect(noteContent(blank)).toBeNull();
    expect(noteContent({ ...blank, complaint: '   ', lines: [{ drug: ' ', dosage: 'x', duration: '' }] })).toBeNull();
  });
  it('keeps only what was written, trimmed', () => {
    expect(noteContent({ ...blank, findings: ' Caries on 16 ' })).toEqual({ findings: 'Caries on 16' });
  });
  it('accepts a prescription alone', () => {
    expect(noteContent({ ...blank, lines: [{ drug: ' Amoxicillin ', dosage: '1 g', duration: '' }] })).toEqual({
      prescription: [{ drug: 'Amoxicillin', dosage: '1 g', duration: '' }],
    });
  });
});

describe('usableLines', () => {
  it('drops rows without a drug', () => {
    expect(usableLines([{ drug: '', dosage: '1 g', duration: '' }, { drug: 'Ibuprofen', dosage: '', duration: '' }])).toHaveLength(1);
  });
});
