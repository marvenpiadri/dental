import { ALL_TEETH, isBlankTooth, newChart, readChart, writeChart, type Chart } from './chart';
import { editChart, plannedTeeth, planChanges, setEdentulous, type EditOutcome } from './plan';
import { applyEdit } from './edits';
import { indexSummary } from './perio';
import { defaultState, serializeState } from './vendor/state/payload';

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
  it('loads an older, sparse payload (no version, missing teeth and fields) without losing what it has', () => {
    let c = newChart();
    c = applied(editChart(c, 'status', [11], { kind: 'restoration', value: 'crown|emax' }));
    const full = writeChart(c) as unknown as { teeth: Record<string, Record<string, unknown>> };
    const sparse = { teeth: { 11: { restorationType: full.teeth['11']!['restorationType'], restorationMaterial: full.teeth['11']!['restorationMaterial'] } } };
    const out = readChart(sparse);
    expect(out.chart).not.toBeNull();
    expect(out.chart!.status.get(11)!.restorationType).toBe('crown');
    expect(out.chart!.status.get(12)).toEqual(defaultState());
    expect(out.issues).toEqual([]);
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

import { compareExaminations, examinationsOf, makeExamination, suggestedDiagnoses } from './exam';
describe('examinations', () => {
  const base = newChart();
  const a = makeExamination('p1', base, { id: 'e1', date: '2026-01-10' });
  const worse = applied(editChart(base, 'status', [16], { kind: 'caries', surface: 'occlusal', on: true }));
  const b = makeExamination('p1', worse, { id: 'e2', date: '2026-06-10' });
  it('history is frozen and per patient', () => {
    expect(a.chart.teeth['16']!.caries).toEqual([]);
    const other = makeExamination('p2', base, { id: 'e3', date: '2026-07-01' });
    expect(examinationsOf('p1', [a, b, other]).map((e) => e.id)).toEqual(['e2', 'e1']);
    expect(examinationsOf('p1', undefined)).toEqual([]);
  });
  it('compares findings between visits', () => {
    const d = compareExaminations(a, b);
    expect(d.teeth.map((t) => t.tooth)).toEqual([16]);
    expect(d.teeth[0]!.fields.some((f) => f.field === 'caries')).toBe(true);
  });
  it('suggests, with a code, a diagnosis from findings', () => {
    expect(suggestedDiagnoses(worse).some((s) => s.tooth === 16 && s.key === 'caries')).toBe(true);
    expect(suggestedDiagnoses(base)).toEqual([]);
  });
});

import { classifyPerio, patchCaseMeta, perioSummary, readCaseMeta } from './perio';
describe('periodontal', () => {
  const probe = (c: Chart, tooth: number, site: string, pd: number, gm = 0, bop = false): Chart =>
    applied(editChart(c, 'status', [tooth], { kind: 'perio', site, pd, gm, bop }));
  it('no probing, no classification', () => { expect(classifyPerio(newChart())).toBeNull(); });
  it('summarises bleeding and depth', () => {
    let c = probe(newChart(), 11, 'MB', 5, 0, true);
    c = probe(c, 11, 'B', 3);
    expect(perioSummary(c)).toMatchObject({ chartedSites: 2, bleedingSites: 1, bopPercent: 50, maxPd: 5 });
  });
  it('classifies severe loss and lets an override win', () => {
    let c = newChart();
    for (const t of [11, 12, 21]) c = probe(c, t, 'MB', 8, 0, true);
    const r = classifyPerio(c)!;
    expect(r.derived.diagnosis).toBe('periodontitis');
    const o = classifyPerio(patchCaseMeta(c, { stageOverride: 'II' }))!;
    expect(o.stage).toBe('II');
    expect(o.overridden.stage).toBe(true);
  });
  it('case meta is clamped, optional, and keeps unknown fields', () => {
    expect(readCaseMeta({ age: 999, hba1c: 1, smokingStatus: 'x' })).toMatchObject({ age: 120, hba1c: 3, smokingStatus: 'unknown' });
    const c = patchCaseMeta({ ...newChart(), caseMeta: { age: 40, other: 'kept' } }, { smokingStatus: 'current' });
    expect(c.caseMeta).toEqual({ age: 40, other: 'kept', smokingStatus: 'current' });
    expect(patchCaseMeta(newChart(), { age: null }).caseMeta).toBeUndefined();
  });
});

import { exportFhir, exportJson, importFhir, importJson } from './io';
describe('import / export', () => {
  const c = applied(editChart(newChart(), 'status', [16], { kind: 'caries', surface: 'occlusal', on: true }));
  it('JSON round trips and rejects junk', () => {
    expect(writeChart(importJson(exportJson(c)).chart!)).toEqual(writeChart(c));
    expect(importJson('{nope').error).toBeTruthy();
    expect(importJson('[]').chart).toBeNull();
  });
  it('FHIR round trips the findings and rejects non-bundles', () => {
    const back = importFhir(exportFhir(c));
    expect(back.chart?.status.get(16)?.caries.has('caries-occlusal')).toBe(true);
    expect(importFhir('{"resourceType":"Patient"}').chart?.status.get(16)?.caries.size ?? 0).toBe(0);
    expect(importFhir('x').error).toBeTruthy();
  });
});

describe('tooth note', () => {
  it('is stored, round trips and has a limit', () => {
    const c = applied(editChart(newChart(), 'status', [11], { kind: 'note', value: 'watch the mesial' }));
    expect(readChart(writeChart(c)).chart!.status.get(11)!.note).toBe('watch the mesial');
    const o = editChart(c, 'status', [11], { kind: 'note', value: 'x'.repeat(501) });
    expect(o.kind === 'applied' && o.rejected.length).toBe(1);
  });
});

describe('charts saved by the old embedded shell', () => {
  // The shell stored getStatusChart(): { version, globals, teeth (all 32, serializeState), case?, plan? }.
  const legacy = () => {
    const teeth: Record<string, unknown> = {};
    for (const n of ALL_TEETH) teeth[n] = serializeState(defaultState());
    const crown = defaultState();
    crown.restorationType = 'crown'; crown.restorationMaterial = 'emax';
    const plan = { ...teeth, 26: serializeState(crown) };
    return { version: '2.22', globals: { wisdomVisible: false, showBase: true, occlusalVisible: true, showHealthyPulp: true, edentulous: false }, teeth, case: { age: 54, smokingStatus: 'former' }, plan };
  };
  it('loads without issues and keeps globals, case data and the plan', () => {
    const out = readChart(JSON.parse(JSON.stringify(legacy())));
    expect(out.issues).toEqual([]);
    expect(out.chart!.globals.wisdomVisible).toBe(false);
    expect(out.chart!.globals.showBase).toBe(true);
    expect(out.chart!.caseMeta).toEqual({ age: 54, smokingStatus: 'former' });
    expect(plannedTeeth(out.chart!)).toEqual([26]);
    expect(out.chart!.status.get(26)!.restorationType).toBe('none');
  });
  it('writes back the same teeth, plan and case data, so nothing is lost on the first save', () => {
    const src = JSON.parse(JSON.stringify(legacy()));
    const back = JSON.parse(JSON.stringify(writeChart(readChart(src).chart!)));
    expect(back.teeth).toEqual(src.teeth);
    expect(back.plan).toEqual(src.plan);
    expect(back.case).toEqual(src.case);
    expect(back.globals).toEqual(src.globals);
  });
});

describe('blank teeth', () => {
  it('is blank until something is recorded, in findings or plan', () => {
    let c = newChart();
    expect(isBlankTooth(c, 18)).toBe(true);
    c = applied(editChart(c, 'plan', [18], { kind: 'restoration', value: 'crown|emax' }));
    expect(isBlankTooth(c, 18)).toBe(false);
    expect(isBlankTooth(c, 28)).toBe(true);
  });
});

describe('plaque and gingival indices', () => {
  it('validates grades and surfaces', () => {
    const t = defaultState();
    expect(applyEdit(t, 16, { kind: 'index', index: 'pi', surface: 'buccal', grade: 4 }).ok).toBe(false);
    expect(applyEdit(t, 16, { kind: 'index', index: 'gi', surface: 'top', grade: 1 }).ok).toBe(false);
    expect(applyEdit(t, 16, { kind: 'index', index: 'pi', surface: 'buccal', grade: 2 }).ok).toBe(true);
    expect(t.pi.get('buccal')).toBe(2);
    applyEdit(t, 16, { kind: 'index', index: 'pi', surface: 'buccal', grade: 0 });
    expect(t.pi.size).toBe(0);
  });
  it('summarises O\'Leary and mean grades, and round trips', () => {
    let c = newChart();
    expect(indexSummary(c)).toEqual({ olearyPercent: 0, meanPi: null, meanGi: null });
    c = applied(editChart(c, 'status', [16], { kind: 'plaque', surface: 'buccal', on: true }));
    c = applied(editChart(c, 'status', [16], { kind: 'index', index: 'gi', surface: 'buccal', grade: 2 }));
    c = applied(editChart(c, 'status', [16], { kind: 'index', index: 'gi', surface: 'mesial', grade: 2 }));
    const present = [...c.status.values()].length;
    expect(indexSummary(c).olearyPercent).toBe(Math.round((1 / (present * 4)) * 1000) / 10);
    expect(indexSummary(c).meanGi).toBe(1);
    const back = readChart(JSON.parse(JSON.stringify(writeChart(c))));
    expect(back.issues).toEqual([]);
    expect(indexSummary(back.chart!)).toEqual(indexSummary(c));
  });
});
