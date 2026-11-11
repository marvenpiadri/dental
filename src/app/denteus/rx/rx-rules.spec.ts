import { describe, expect, it } from 'vitest';
import { AllergyDef, LibMedication, PatientAllergy, PatientMedication, Prescription, RxAlert, RxItem, RxSnapshot, RxTemplate } from '../models/dental.models';
import { RxContext, applyIssue, issueProblem, itemFromMedication, itemTitle, itemsFromTemplate, move, nextRxNumber, rxWarnings, startCorrection, tidyItem, voidPrescription } from './rx-rules';

const item = (name: string, extra: Partial<RxItem> = {}): RxItem => ({ id: name, name, ...extra });
const label = (c: string) => c;
const snap: RxSnapshot = { clinic: { name: 'Clinic' }, dentist: { name: 'Dr A' }, patient: { name: 'P' } };
const draft = (id: string, extra: Partial<Prescription> = {}): Prescription => ({ id, status: 'draft', createdAt: 'x', updatedAt: 'x', items: [item('Amoxicillin')], ...extra });

const meds: LibMedication[] = [
  { id: 'g1', kind: 'generic', name: 'Amoxicillin' }, { id: 'b1', kind: 'brand', name: 'Clamoxyl', genericId: 'g1' },
  { id: 'g2', kind: 'generic', name: 'Ibuprofen', reviewConditions: ['kidney'] }, { id: 'g3', kind: 'generic', name: 'Warfarin' },
];
const defs: AllergyDef[] = [{ id: 'a1', name: 'Penicillin allergy', medicationId: 'g1' }, { id: 'a2', name: 'Latex' }];
const pa = (allergyId: string, active = true): PatientAllergy => ({ id: 'pa' + allergyId, allergyId, label: allergyId, active, createdAt: '', history: [] });
const pm = (medicationId: string): PatientMedication => ({ id: 'pm' + medicationId, medicationId, label: medicationId, active: true, createdAt: '', history: [] });
const ctx = (extra: Partial<RxContext> = {}): RxContext => ({ allergies: [], medications: [], allergyDefs: defs, meds, ...extra });
const line = (name: string, extra: Partial<RxItem> = {}): RxItem => item(name, extra);

describe('rxWarnings', () => {
  it('flags an allergy the dentist linked to a medication, for the generic and for any brand of it', () => {
    const w = rxWarnings(ctx({ allergies: [pa('a1')] }), [line('Clamoxyl', { medicationId: 'b1' })], label);
    expect(w.find((x) => x.level === 'critical')?.params).toMatchObject({ allergy: 'Penicillin allergy', linked: 'Amoxicillin' });
    expect(rxWarnings(ctx({ allergies: [pa('a1')] }), [line('Amoxicillin', { medicationId: 'g1' })], label).some((x) => x.level === 'critical')).toBe(true);
  });
  it('says nothing about an allergy that is not linked to this drug, or typed lines with no library entry (no class or name guessing)', () => {
    expect(rxWarnings(ctx({ allergies: [pa('a2')] }), [line('Amoxicillin', { medicationId: 'g1' })], label).some((x) => x.level !== 'info')).toBe(false);
    expect(rxWarnings(ctx({ allergies: [pa('a1')] }), [line('Amoxicillin')], label).some((x) => x.level === 'critical')).toBe(false);
    expect(rxWarnings(ctx({ allergies: [pa('a1')] }), [line('Ibuprofen', { medicationId: 'g2' })], label).some((x) => x.level === 'critical')).toBe(false);
  });
  it('ignores allergies the caller has filtered out as inactive (the page passes active ones only)', () => {
    expect(rxWarnings(ctx(), [line('Amoxicillin', { medicationId: 'g1' })], label)).toEqual([]);
  });
  it('raises the alerts configured on the line and names what triggered them', () => {
    const alerts: RxAlert[] = [
      { id: 'x1', type: 'allergy', refId: 'a2', label: 'Latex', severity: 'critical', message: 'Use latex-free kit.' },
      { id: 'x2', type: 'medication', refId: 'g3', label: 'Warfarin', severity: 'warning' },
      { id: 'x3', type: 'problem', refId: 'kidney', label: 'kidney', severity: 'warning' },
    ];
    const w = rxWarnings(ctx({ allergies: [pa('a2')], medications: [pm('g3')], medical: { conditions: ['kidney'] } }), [line('Ibuprofen', { medicationId: 'g2', alerts })], label);
    expect(w.filter((x) => x.key === 'rx.w.tplAllergy')[0]).toMatchObject({ level: 'critical', params: { label: 'Latex', extra: ' Use latex-free kit.' } });
    expect(w.filter((x) => x.key === 'rx.w.tplMedication' || x.key === 'rx.w.tplProblem')).toHaveLength(2);
    expect(rxWarnings(ctx(), [line('Ibuprofen', { medicationId: 'g2', alerts })], label).some((x) => x.level !== 'info')).toBe(false);
  });
  it('matches a medication alert through the generic, so a brand the patient takes counts', () => {
    const alerts: RxAlert[] = [{ id: 'x', type: 'medication', refId: 'g1', label: 'Amoxicillin', severity: 'warning' }];
    expect(rxWarnings(ctx({ medications: [pm('b1')] }), [line('Other', { alerts })], label).some((x) => x.key === 'rx.w.tplMedication')).toBe(true);
  });
  it('warns when the drug is already a current medication and when a dentist-chosen condition applies', () => {
    const w = rxWarnings(ctx({ medications: [pm('g3')], medical: { conditions: ['kidney'] } }), [line('Warfarin', { medicationId: 'g3' }), line('Ibuprofen', { medicationId: 'g2', reviewConditions: ['kidney', 'asthma'] })], label);
    expect(w.filter((x) => x.level === 'warning').map((x) => x.key)).toEqual(['rx.w.current', 'rx.w.condition']);
  });
  it('keeps the old free text visible and only suggests a possible match, until a record is confirmed from it', () => {
    const w = rxWarnings(ctx({ medical: { allergies: 'Ibuprofen, latex' } }), [line('Ibuprofen')], label);
    expect(w.some((x) => x.key === 'rx.w.legacyAllergy' && x.level === 'warning')).toBe(true);
    expect(w.some((x) => x.level === 'critical')).toBe(false);
    const done = rxWarnings(ctx({ medical: { allergies: 'Ibuprofen, latex', legacyMatched: ['ibuprofen', 'latex'] } }), [line('Ibuprofen')], label);
    expect(done.some((x) => x.key === 'rx.w.legacyAllergy' || x.key === 'rx.w.legacyNotes')).toBe(false);
  });
  it('shows what is on file as information', () => {
    const w = rxWarnings(ctx({ allergies: [pa('a2')], medications: [pm('g3')], medical: { conditions: ['diabetes'] }, alert: 'Anxious' }), [line('Paracetamol')], label);
    expect(w.map((x) => x.level)).toEqual(['info', 'info', 'info', 'info']);
  });
});

describe('issueProblem', () => {
  it('needs a line, a name on every line and every critical note acknowledged', () => {
    expect(issueProblem([], [], [])).toBe('empty');
    expect(issueProblem([item('')], [], [])).toBe('unnamed');
    const w = rxWarnings(ctx({ allergies: [pa('a1')] }), [line('Amoxicillin', { medicationId: 'g1' })], label);
    expect(issueProblem([item('Amoxicillin')], w, [])).toBe('unreviewed');
    expect(issueProblem([item('Amoxicillin')], w, w.filter((x) => x.level === 'critical').map((x) => x.id))).toBeNull();
  });
});

describe('numbering and lifecycle', () => {
  it('numbers per year and never reuses', () => {
    expect(nextRxNumber([], 2026)).toBe('RX-2026-0001');
    expect(nextRxNumber([draft('a', { number: 'RX-2026-0007' }), draft('b', { number: 'RX-2025-0099' })], 2026)).toBe('RX-2026-0008');
  });
  it('issues a draft: freezes trimmed lines and the snapshot, and the number', () => {
    const list = applyIssue([draft('a', { items: [item('  Amoxicillin ', { dosage: ' ' })] })], 'a', 'RX-2026-0001', snap, [], 'now');
    expect(list[0]).toMatchObject({ status: 'issued', number: 'RX-2026-0001', snapshot: snap, issuedAt: 'now' });
    expect(list[0].items[0]).toMatchObject({ name: 'Amoxicillin', dosage: undefined });
  });
  it('does not re-issue or change an issued prescription', () => {
    const issued = applyIssue([draft('a')], 'a', 'RX-2026-0001', snap, [], 't1');
    expect(applyIssue(issued, 'a', 'RX-2026-0002', snap, [], 't2')[0].number).toBe('RX-2026-0001');
  });
  it('a correction keeps the original untouched until it is issued, then supersedes it', () => {
    const issued = applyIssue([draft('a')], 'a', 'RX-2026-0001', snap, [], 't1');
    const fix = startCorrection(issued[0], 'b', ' wrong dose ', 't2', () => 'n1');
    expect(fix).toMatchObject({ status: 'draft', correctsId: 'a', correctionReason: 'wrong dose' });
    const before = applyIssue([...issued, fix], 'zzz', 'x', snap, [], 't3');
    expect(before[0].status).toBe('issued');
    const after = applyIssue([...issued, fix], 'b', 'RX-2026-0002', snap, [], 't3');
    expect(after[0]).toMatchObject({ status: 'superseded', supersededById: 'b' });
    expect(after[0].items).toEqual(issued[0].items);
  });
  it('voids only issued prescriptions and only with a reason', () => {
    const issued = applyIssue([draft('a'), draft('d')], 'a', 'RX-2026-0001', snap, [], 't1');
    expect(voidPrescription(issued, 'a', '  ', 't2')[0].status).toBe('issued');
    const v = voidPrescription(issued, 'a', 'Wrong patient', 't2');
    expect(v[0]).toMatchObject({ status: 'voided', voidReason: 'Wrong patient' });
    expect(voidPrescription(issued, 'd', 'x', 't2')[1].status).toBe('draft');
  });
});

describe('lines', () => {
  it('copies a library entry and a template into independent lines; a brand prints with its generic', () => {
    const line = itemFromMedication(meds[1], meds, 'i1');
    expect(line).toMatchObject({ name: 'Clamoxyl', generic: 'Amoxicillin', medicationId: 'b1' });
    expect(itemFromMedication(meds[2], meds, 'i2').reviewConditions).toEqual(['kidney']);
    const t: RxTemplate = { id: 't', name: 'T', items: [{ ...line, strength: '500 mg', alerts: [{ id: 'a', type: 'problem', refId: 'kidney', label: 'k', severity: 'warning' }] }], updatedAt: 'x' };
    const copy = itemsFromTemplate(t, () => 'new');
    copy[0].dosage = '1';
    copy[0].alerts![0].message = 'changed';
    expect(t.items[0].dosage).toBeUndefined();
    expect(t.items[0].alerts![0].message).toBeUndefined();
    expect(copy[0].id).toBe('new');
  });
  it('keeps an issued prescription as written when the library or the template changes later', () => {
    const t: RxTemplate = { id: 't', name: 'T', items: [{ ...itemFromMedication(meds[0], meds, 'i1'), dosage: '1 cap' }], updatedAt: 'x' };
    const issued = applyIssue([draft('a', { items: itemsFromTemplate(t, () => 'n1') })], 'a', 'RX-2026-0001', snap, [], 't1');
    meds[0].name = 'Renamed'; t.items[0].dosage = 'changed';
    expect(issued[0].items[0]).toMatchObject({ name: 'Amoxicillin', dosage: '1 cap' });
    meds[0].name = 'Amoxicillin';
  });
  it('reorders', () => {
    expect(move([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(move([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
  it('tidies empty strings away', () => {
    expect(tidyItem({ id: 'a', name: ' X ', strength: ' ', route: 'oral' })).toMatchObject({ name: 'X', strength: undefined, route: 'oral' });
  });
});
