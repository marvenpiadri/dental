import { describe, expect, it } from 'vitest';
import { Prescription, RxItem, RxSnapshot, RxTemplate } from '../models/dental.models';
import { applyIssue, issueProblem, itemFromMedication, itemTitle, itemsFromTemplate, move, nextRxNumber, rxWarnings, startCorrection, tidyItem, voidPrescription } from './rx-rules';

const item = (name: string, extra: Partial<RxItem> = {}): RxItem => ({ id: name, name, ...extra });
const label = (c: string) => c;
const snap: RxSnapshot = { clinic: { name: 'Clinic' }, dentist: { name: 'Dr A' }, patient: { name: 'P' } };
const draft = (id: string, extra: Partial<Prescription> = {}): Prescription => ({ id, status: 'draft', createdAt: 'x', updatedAt: 'x', items: [item('Amoxicillin')], ...extra });

describe('rxWarnings', () => {
  it('flags a documented allergy that names the drug, a brand, the ingredient or a family alias', () => {
    expect(rxWarnings({ allergies: 'Allergic to Amoxicillin' }, undefined, [item('Amoxicillin 500')], label).find((w) => w.level === 'critical')).toBeTruthy();
    expect(rxWarnings({ allergies: 'penicilline' }, undefined, [item('Clamoxyl', { generic: 'amoxicillin', aliases: 'Penicillin' })], label).some((w) => w.level === 'critical')).toBe(true);
    expect(rxWarnings({ allergies: 'Ibuprofène' }, undefined, [item('Brufen', { generic: 'Ibuprofen' })], label).some((w) => w.level === 'critical')).toBe(true);
  });
  it('does not match on form words or short words', () => {
    expect(rxWarnings({ allergies: 'acid reflux, gel' }, undefined, [item('Clavulanic acid gel')], label).some((w) => w.level === 'critical')).toBe(false);
    expect(rxWarnings({ allergies: 'none known' }, undefined, [item('Paracetamol')], label).some((w) => w.level === 'critical')).toBe(false);
  });
  it('does not claim a family match the clinic did not write (no invented cross-allergies)', () => {
    expect(rxWarnings({ allergies: 'Penicillin' }, undefined, [item('Amoxicillin')], label).some((w) => w.level === 'critical')).toBe(false);
  });
  it('warns when the drug is already a current medication and when a dentist-chosen condition applies', () => {
    const w = rxWarnings({ medications: 'Warfarin 5 mg', conditions: ['kidney'] }, undefined, [item('Warfarin'), item('Ibuprofen', { reviewConditions: ['kidney', 'asthma'] })], label);
    expect(w.filter((x) => x.level === 'warning').map((x) => x.key)).toEqual(['rx.w.current', 'rx.w.condition']);
  });
  it('shows what is on file as information and nothing else when no drug matches', () => {
    const w = rxWarnings({ allergies: 'Latex', conditions: ['diabetes'], medications: 'Metformin' }, 'Anxious', [item('Paracetamol')], label);
    expect(w.map((x) => x.level)).toEqual(['info', 'info', 'info', 'info']);
  });
});

describe('issueProblem', () => {
  it('needs a line, a name on every line and every critical note acknowledged', () => {
    expect(issueProblem([], [], [])).toBe('empty');
    expect(issueProblem([item('')], [], [])).toBe('unnamed');
    const w = rxWarnings({ allergies: 'amoxicillin' }, undefined, [item('Amoxicillin')], label);
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
  it('copies a medication and a template into independent lines', () => {
    const m = { id: 'm1', name: 'Paracetamol', strength: '500 mg', form: 'tablet', instructions: 'After meals' };
    const line = itemFromMedication(m, 'i1');
    expect(itemTitle(line)).toBe('Paracetamol 500 mg tablet');
    const t: RxTemplate = { id: 't', name: 'T', items: [line], updatedAt: 'x' };
    const copy = itemsFromTemplate(t, () => 'new');
    copy[0].dosage = '1';
    expect(t.items[0].dosage).toBeUndefined();
    expect(copy[0].id).toBe('new');
  });
  it('reorders', () => {
    expect(move([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(move([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
  it('tidies empty strings away', () => {
    expect(tidyItem({ id: 'a', name: ' X ', strength: ' ', route: 'oral' })).toMatchObject({ name: 'X', strength: undefined, route: 'oral' });
  });
});
