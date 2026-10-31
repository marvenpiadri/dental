import { Patient } from '../models/dental.models';
import { guessSource, sourceValue } from './form-models';

const patient: Patient = { id: '1', fullName: 'Nasiri Asmae Ben', phone: '0612', birthDate: '1994-06-21', insurer: 'CNSS', insuranceNumber: '123', plan: [{ id: 'a', procedure: 'crown', price: 500, status: 'done', tooth: '14' }, { id: 'b', procedure: 'filling', price: 300, status: 'planned' }] };
const ctx = { patient, clinic: 'Dentaleus', today: new Date(2026, 9, 5), sexLabel: () => 'F', actName: (i: { procedure: string }) => i.procedure };

describe('form sources', () => {
  it('writes names as "last first" and dates as dd/mm/yyyy', () => {
    expect(sourceValue('patient.lastName', ctx)).toBe('Nasiri');
    expect(sourceValue('patient.firstName', ctx)).toBe('Asmae Ben');
    expect(sourceValue('patient.birthDate', ctx)).toBe('21/06/1994');
    expect(sourceValue('date.today', ctx)).toBe('05/10/2026');
  });
  it('totals and lists only the acts that were done', () => {
    expect(sourceValue('total.done', ctx)).toBe('500');
    expect(sourceValue('acts.list', ctx)).toBe('crown 14');
  });
  it('ticks the box that matches the sex', () => {
    const c = { ...ctx, patient: { ...patient, sex: 'female' as const } };
    expect([sourceValue('check.female', c), sourceValue('check.male', c)]).toEqual(['X', '']);
  });
  it('leaves hand-typed blanks empty', () => expect(sourceValue('text', ctx)).toBe(''));
});

describe('guessSource', () => {
  it.each([['Prénom', 'patient.firstName'], ['Nom', 'patient.lastName'], ['Date de naissance', 'patient.birthDate'], ["N° d'immatriculation", 'patient.insuranceNumber'], ['Téléphone', 'patient.phone'], ['Remarque', 'text']])('%s -> %s', (name, source) => expect(guessSource(name)).toBe(source));
});
