import { describe, expect, it } from 'vitest';
import { AllergyDef, LibMedication, Patient, PatientAllergy, PatientMedication, RxTemplate } from '../models/dental.models';
import { allergyDependencies, allergyInUse, displayName, genericOf, medDeleteBlocks, medDependencies, medProblem, mergeAllergies, readMedications } from './med-library';

const g = (id: string, name: string): LibMedication => ({ id, kind: 'generic', name });
const b = (id: string, name: string, genericId: string): LibMedication => ({ id, kind: 'brand', name, genericId });
const pa = (id: string, allergyId: string, extra: Partial<PatientAllergy> = {}): PatientAllergy => ({ id, allergyId, label: allergyId, active: true, createdAt: '', history: [], ...extra });
const pm = (id: string, medicationId: string, extra: Partial<PatientMedication> = {}): PatientMedication => ({ id, medicationId, label: medicationId, active: true, createdAt: '', history: [], ...extra });
const patient = (id: string, extra: Partial<Patient> = {}) => ({ id, fullName: 'P' + id, ...extra }) as Patient;
const meds = [g('g1', 'Amoxicillin'), b('b1', 'Clamoxyl', 'g1'), b('b2', 'Amoxil', 'g1')];

describe('generic and brand', () => {
  it('needs an existing generic for a brand, allows several brands, and shows the generic through the link', () => {
    expect(medProblem(meds, b('x', 'Orphan', 'nope'))).toBe('generic');
    expect(medProblem(meds, b('x', 'Brand of a brand', 'b1'))).toBe('generic');
    expect(medProblem(meds, b('x', 'Third', 'g1'))).toBeNull();
    expect(displayName(meds, meds[1])).toBe('Clamoxyl (Amoxicillin)');
    expect(genericOf(meds, 'b2')?.id).toBe('g1');
    expect(genericOf(meds, 'g1')?.id).toBe('g1');
  });
  it('refuses empty names and look-alike duplicates (case and accents ignored) but not the same brand name under another generic', () => {
    expect(medProblem(meds, g('x', '  '))).toBe('name');
    expect(medProblem(meds, g('x', 'amoxicillin'))).toBe('duplicate');
    expect(medProblem(meds, g('g1', 'Amoxicillin'))).toBeNull();
    expect(medProblem([...meds, g('g2', 'Other')], b('x', 'Clamoxyl', 'g2'))).toBeNull();
  });
});

describe('dependencies and deletion protection', () => {
  const defs: AllergyDef[] = [{ id: 'a1', name: 'Penicillin', medicationId: 'g1' }];
  const patients = [patient('1', { patientMedications: [pm('m', 'b1')], patientAllergies: [pa('p', 'a1')] }), patient('2', { patientMedications: [pm('n', 'b1', { removedAt: 'x' })] }), patient('3')];
  const tpl: RxTemplate = { id: 't', name: 'T', updatedAt: '', items: [{ id: 'i', name: 'X', medicationId: 'b2' }] };
  it('lists references by record, not by text', () => {
    const d = medDependencies('b1', meds, defs, [tpl], patients);
    expect(d.patientsTaking).toEqual([{ id: '1', name: 'P1' }]);
    expect(medDependencies('g1', meds, defs, [tpl], patients).patientsAllergic).toEqual([{ id: '1', name: 'P1' }]);
    expect(medDependencies('g1', meds, defs, [tpl], patients).brands.map((x) => x.id)).toEqual(['b1', 'b2']);
    expect(medDependencies('b2', meds, defs, [tpl], patients).templates).toHaveLength(1);
  });
  it('blocks deleting what is referenced and allows what is not', () => {
    expect(medDeleteBlocks(medDependencies('g1', meds, defs, [], patients))).toEqual(['brands', 'patients', 'allergies']);
    expect(medDeleteBlocks(medDependencies('b1', meds, defs, [], patients))).toEqual(['patients']);
    expect(medDeleteBlocks(medDependencies('b2', meds, defs, [tpl], patients))).toEqual(['templates']);
    expect(medDeleteBlocks(medDependencies('b1', meds, [], [], [patients[2]]))).toEqual([]);
  });
  it('treats an allergy as in use by patients or by template alerts', () => {
    const alertTpl: RxTemplate = { id: 't', name: 'T', updatedAt: '', items: [{ id: 'i', name: 'X', alerts: [{ id: 'a', type: 'allergy', refId: 'a9', label: 'L', severity: 'warning' }] }] };
    expect(allergyInUse(allergyDependencies('a1', [], patients))).toBe(true);
    expect(allergyInUse(allergyDependencies('a9', [alertTpl], patients))).toBe(true);
    expect(allergyInUse(allergyDependencies('a2', [alertTpl], patients))).toBe(false);
  });
});

describe('mergeAllergies', () => {
  const defs: AllergyDef[] = [{ id: 'keep', name: 'Penicillin' }, { id: 'dup', name: 'Penicilline', medicationId: 'g1', hidden: true }];
  const patients = [patient('1', { patientAllergies: [pa('p1', 'dup', { reaction: 'rash' })] }), patient('2', { patientAllergies: [pa('p2', 'keep')] }), patient('3')];
  const tpl: RxTemplate = { id: 't', name: 'T', updatedAt: '', items: [{ id: 'i', name: 'X', alerts: [{ id: 'a', type: 'allergy', refId: 'dup', label: 'Penicilline', severity: 'critical' }, { id: 'b', type: 'allergy', refId: 'keep', label: 'Penicillin', severity: 'critical' }] }] };
  it('moves patient records and template alerts to the kept allergy and keeps the history', () => {
    const r = mergeAllergies(defs, patients, [tpl], 'dup', 'keep', 'now');
    expect(r.moved).toBe(1);
    expect(r.defs).toEqual([{ id: 'keep', name: 'Penicillin', medicationId: 'g1', externalId: undefined, hidden: undefined }]);
    expect(r.patients[0].patientAllergies![0]).toMatchObject({ allergyId: 'keep', reaction: 'rash', label: 'dup' });
    expect(r.patients[0].patientAllergies![0].history.at(-1)).toEqual({ at: 'now', what: 'merged', note: 'Penicilline' });
    expect(r.templates[0].items[0].alerts).toHaveLength(1);
    expect(r.patients[2]).toBe(patients[2]);
  });
  it('does nothing for the same id or an unknown allergy', () => {
    expect(mergeAllergies(defs, patients, [tpl], 'keep', 'keep', 'n').defs).toHaveLength(2);
    expect(mergeAllergies(defs, patients, [tpl], 'nope', 'keep', 'n').moved).toBe(0);
  });
});

describe('readMedications (migration of the first flat list)', () => {
  let n = 0;
  const id = () => `new${++n}`;
  it('turns flat entries into generic and brand, keeping ids and every typed detail', () => {
    const { list, migrated } = readMedications([
      { id: 'o1', name: 'Amoxicillin', brand: 'Clamoxyl', strength: '500 mg', form: 'capsule', instructions: 'With food', reviewConditions: ['kidney'] },
      { id: 'o2', name: 'Augmentin', generic: 'Amoxicillin' },
      { id: 'o3', name: 'Paracetamol', archivedAt: 'x' },
    ], id);
    expect(migrated).toBe(true);
    const generic = list.find((m) => m.name === 'Amoxicillin')!;
    expect(generic).toMatchObject({ id: 'o1', kind: 'generic', notes: '500 mg capsule. With food', reviewConditions: ['kidney'] });
    expect(list.find((m) => m.name === 'Clamoxyl')).toMatchObject({ kind: 'brand', genericId: 'o1' });
    expect(list.find((m) => m.name === 'Augmentin')).toMatchObject({ id: 'o2', kind: 'brand', genericId: 'o1' });
    expect(list.filter((m) => m.name === 'Amoxicillin')).toHaveLength(1);
    expect(list.find((m) => m.id === 'o3')?.hidden).toBe(true);
  });
  it('leaves structured entries alone and ignores junk', () => {
    const ok = [{ id: 'g', kind: 'generic', name: 'X', notes: 'n' }, { id: 'b', kind: 'brand', name: 'Y', genericId: 'g' }];
    expect(readMedications([...ok, null, 3, { id: 'z' }], id)).toEqual({ list: ok, migrated: false });
    expect(readMedications('nope', id).list).toEqual([]);
  });
});
