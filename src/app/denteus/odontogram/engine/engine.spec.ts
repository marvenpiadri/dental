import { describe, expect, it } from 'vitest';
import { ALL_TEETH, newChart, readChart, writeChart, type Chart } from './chart';
import { editChart, plannedTeeth, planChanges, setEdentulous, type EditOutcome } from './plan';
import { applyEdit } from './edits';
import { defaultState } from './vendor/state/payload';

const applied = (o: EditOutcome): Chart => { if (o.kind !== 'applied') throw new Error('confirm'); return o.chart; };

describe('chart round trip', () => {
  it('writes and reads back identically', () => {
    let c = newChart();
    c = applied(editChart(c, 'status', [16], { kind: 'caries', surface: 'occlusal', on: true }));
    c = applied(editChart(c, 'status', [11], { kind: 'restoration', value: 'crown|emax' }));
    const out = readChart(JSON.parse(JSON.stringify(writeChart(c))));
    expect(out.issues).toEqual([]);
    expect(writeChart(out.chart!)).toEqual(writeChart(c));
  });
  it('rejects unusable payloads instead of returning an empty chart', () => {
    expect(readChart(null).chart).toBeNull();
    expect(readChart({ version: '2.22' }).chart).toBeNull();
    expect(readChart('x').issues.length).toBe(1);
  });
  it('reports unrecognised values and unknown teeth', () => {
    const p = writeChart(newChart()) as unknown as { teeth: Record<string, Record<string, unknown>> };
    p.teeth['11']!['mobility'] = 'm9';
    p.teeth['99'] = {};
    const { chart, issues } = readChart(p);
    expect(chart).not.toBeNull();
    expect(issues.map((i) => i.path).sort()).toEqual(['teeth.11.mobility', 'teeth.99']);
  });
  it('keeps case metadata and plan, and omits an identical plan', () => {
    let c = newChart();
    c.caseMeta = { age: 41 };
    c = applied(editChart(c, 'plan', [26], { kind: 'restoration', value: 'crown|zircon' }));
    const p = writeChart(c);
    expect(p.case).toEqual({ age: 41 });
    expect(p.plan).toBeDefined();
    expect(readChart(p).chart!.plan).not.toBeNull();
    expect(writeChart(newChart()).plan).toBeUndefined();
  });
});

describe('isolation', () => {
  it('editing one chart never touches another or its input', () => {
    const a = newChart(); const b = newChart();
    const a2 = applied(editChart(a, 'status', [11], { kind: 'selection', value: 'implant' }));
    expect(a.status.get(11)!.toothSelection).toBe('tooth-base');
    expect(b.status.get(11)!.toothSelection).toBe('tooth-base');
    expect(a2.status.get(11)!.toothSelection).toBe('implant');
  });
});

describe('invariants', () => {
  it('rejects invalid values without changing state', () => {
    const o = editChart(newChart(), 'status', [11], { kind: 'enum', field: 'mobility', value: 'm9' });
    expect(o.kind === 'applied' && o.rejected.length === 1 && o.changed.length === 0).toBe(true);
  });
  it('blocks deciduous on second-dentition molars', () => {
    const o = editChart(newChart(), 'status', [16, 11], { kind: 'selection', value: 'milktooth' });
    expect(o.kind === 'applied' && o.changed).toEqual([11]);
  });
  it('an invalid restoration pair is rejected', () => {
    const t = defaultState();
    expect(applyEdit(t, 11, { kind: 'restoration', value: 'crown|gic' }).ok).toBe(false);
  });
  it('implant clears caries/endo/fillings', () => {
    const t = defaultState();
    applyEdit(t, 16, { kind: 'caries', surface: 'mesial', on: true });
    applyEdit(t, 16, { kind: 'selection', value: 'implant' });
    expect(t.caries.size).toBe(0);
  });
  it('perio: needs pd first, whole-number only, pd<1 uncharts', () => {
    const t = defaultState();
    expect(applyEdit(t, 11, { kind: 'perio', site: 'MB', bop: true }).ok).toBe(false);
    expect(applyEdit(t, 11, { kind: 'perio', site: 'MB', pd: 6.5 }).ok).toBe(false);
    expect(applyEdit(t, 11, { kind: 'perio', site: 'MB', pd: 5, gm: 1, bop: true }).ok).toBe(true);
    expect(t.perio.pd.get('MB')).toBe(5);
    applyEdit(t, 11, { kind: 'perio', site: 'MB', pd: 0 });
    expect(t.perio.bop.size).toBe(0);
  });
  it('furcation entrance is position gated', () => {
    const t = defaultState();
    expect(applyEdit(t, 16, { kind: 'furcation', entrance: 'lingual', grade: 2 }).ok).toBe(false);
    expect(applyEdit(t, 16, { kind: 'furcation', entrance: 'buccal', grade: 2 }).ok).toBe(true);
  });
  it('apical dx other than periodontitis clears the lesion subtype', () => {
    const t = defaultState();
    applyEdit(t, 11, { kind: 'enum', field: 'apicalDx', value: 'asymptomatic-apical-periodontitis' });
    applyEdit(t, 11, { kind: 'enum', field: 'periapicalType', value: 'cyst' });
    applyEdit(t, 11, { kind: 'enum', field: 'apicalDx', value: 'normal' });
    expect(t.periapicalType).toBe('none');
  });
});

describe('status vs plan', () => {
  it('a planned crown is never a status finding', () => {
    const c = applied(editChart(newChart(), 'plan', [11], { kind: 'restoration', value: 'crown|emax' }));
    expect(c.status.get(11)!.restorationType).toBe('none');
    expect(c.plan!.get(11)!.restorationType).toBe('crown');
    expect(plannedTeeth(c)).toEqual([11]);
    expect(planChanges(c).map((p) => p.tooth)).toEqual([11]);
    expect(writeChart(c).teeth['11']!.restorationType).toBe('none');
  });
  it('unplanned teeth keep tracking status', () => {
    let c = applied(editChart(newChart(), 'plan', [11], { kind: 'restoration', value: 'crown|emax' }));
    c = applied(editChart(c, 'status', [12], { kind: 'caries', surface: 'mesial', on: true }));
    expect(c.plan!.get(12)!.caries.has('caries-mesial')).toBe(true);
  });
  it('a status edit on a planned tooth asks first, then diverges', () => {
    let c = applied(editChart(newChart(), 'plan', [11], { kind: 'restoration', value: 'crown|emax' }));
    const o = editChart(c, 'status', [11], { kind: 'caries', surface: 'mesial', on: true });
    expect(o).toEqual({ kind: 'confirm', teeth: [11] });
    c = applied(editChart(c, 'status', [11], { kind: 'caries', surface: 'mesial', on: true }, { confirmed: true }));
    expect(c.status.get(11)!.caries.has('caries-mesial')).toBe(true);
    expect(c.plan!.get(11)!.restorationType).toBe('crown');
    expect(c.plan!.get(11)!.caries.has('caries-mesial')).toBe(false);
  });
  it('planned teeth stay protected after a save and reload', () => {
    const c = applied(editChart(newChart(), 'plan', [11], { kind: 'restoration', value: 'crown|emax' }));
    const reloaded = readChart(JSON.parse(JSON.stringify(writeChart(c)))).chart!;
    expect(editChart(reloaded, 'status', [11], { kind: 'caries', surface: 'mesial', on: true }).kind).toBe('confirm');
  });
  it('edentulous sets every tooth missing and any rebuild clears the flag', () => {
    let c = applied(setEdentulous(newChart(), 'status'));
    expect(c.globals.edentulous).toBe(true);
    expect(ALL_TEETH.every((n) => c.status.get(n)!.toothSelection === 'none')).toBe(true);
    c = applied(editChart(c, 'status', [11], { kind: 'selection', value: 'tooth-base' }));
    expect(c.globals.edentulous).toBe(false);
  });
});
