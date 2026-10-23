import { Patient } from '../models/dental.models';
import { ageOn, digitsOf, initials, matchesQuery, normalize, parseIsoDate, validatePatient } from './patient-rules';

const TODAY = new Date(2026, 9, 22); // 22 Oct 2026
const patient = (over: Partial<Patient> = {}): Patient => ({ id: 'p1', fullName: 'Hélène Benali', phone: '+212 600-000-001', ...over });
const empty = { fullName: '', phone: '' };

describe('search', () => {
  it('ignores accents and case', () => {
    expect(normalize('  HÉLÈNE ')).toBe('helene');
    expect(matchesQuery(patient(), 'helene')).toBe(true);
    expect(matchesQuery(patient(), 'BENALI')).toBe(true);
  });

  it('matches a phone by digits wherever they sit, but only from 3 digits', () => {
    expect(matchesQuery(patient(), '600 000')).toBe(true);
    expect(matchesQuery(patient(), '06')).toBe(false);
    expect(digitsOf('+212 600-000-001')).toBe('212600000001');
  });

  it('matches everyone when the query is empty', () => {
    expect(matchesQuery(patient(), '   ')).toBe(true);
  });
});

describe('validatePatient', () => {
  it('accepts a name alone', () => {
    expect(validatePatient({ ...empty, fullName: 'Sara Benali' }, [], TODAY)).toEqual({});
  });

  it('requires a real name', () => {
    expect(validatePatient({ ...empty, fullName: ' a ' }, [], TODAY).fullName).toBe('name-required');
  });

  it('rejects malformed phone, email and birth date', () => {
    const result = validatePatient({ fullName: 'Sara Benali', phone: '12ab', email: 'sara@', birthDate: '2026-02-31' }, [], TODAY);
    expect(result).toEqual({ phone: 'phone-invalid', email: 'email-invalid', birthDate: 'birth-invalid' });
  });

  it('rejects a birth date in the future or over 120 years ago', () => {
    expect(validatePatient({ fullName: 'Sara', phone: '', birthDate: '2026-10-23' }, [], TODAY).birthDate).toBe('birth-invalid');
    expect(validatePatient({ fullName: 'Sara', phone: '', birthDate: '1890-01-01' }, [], TODAY).birthDate).toBe('birth-invalid');
  });

  it('flags the same name and phone, but not the same name alone', () => {
    const others = [patient()];
    expect(validatePatient({ fullName: 'helene BENALI', phone: '0600000001'.replace(/^0/, '+2120') }, others, TODAY).fullName).toBeUndefined();
    expect(validatePatient({ fullName: 'helene benali', phone: '+212 600 000 001' }, others, TODAY).fullName).toBe('duplicate');
    expect(validatePatient({ fullName: 'Hélène Benali', phone: '' }, others, TODAY).fullName).toBeUndefined();
  });

  it('does not flag a patient as a duplicate of themselves when editing', () => {
    expect(validatePatient({ fullName: 'Hélène Benali', phone: '+212 600 000 001' }, [patient()], TODAY, 'p1')).toEqual({});
  });
});

describe('dates and names', () => {
  it('counts whole years, including the day before a birthday', () => {
    expect(ageOn('2000-10-22', TODAY)).toBe(26);
    expect(ageOn('2000-10-23', TODAY)).toBe(25);
    expect(ageOn(undefined, TODAY)).toBeNull();
    expect(parseIsoDate('2026-02-31')).toBeNull();
  });

  it('builds initials from the first two words', () => {
    expect(initials('Amine El Idrissi')).toBe('AE');
    expect(initials('Sara')).toBe('S');
    expect(initials('  ')).toBe('?');
    expect(initials('محمد العلوي')).toBe('ما'); // first letter of each word; "ال" is the article, not skipped
  });
});
