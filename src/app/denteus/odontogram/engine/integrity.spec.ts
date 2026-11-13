// Clinical data integrity: damaged data is never read as healthy, type changes never erase silently, history never moves.
import { newChart, readChart, writeChart, needsReview, type Chart } from './chart';
import { editChart } from './plan';
import { applyEdit } from './edits';
import { makeExamination } from './exam';
import { defaultState } from './vendor/state/payload';

const applied = (o: ReturnType<typeof editChart>): Chart => { if (o.kind !== 'applied') throw new Error('expected applied'); return o.chart; };
const payload = () => JSON.parse(JSON.stringify(writeChart(newChart())));

describe('damaged charts', () => {
  it('a tooth that is not an object is flagged lossy and the chart needs review', () => {
    const p = payload(); p.teeth['16'] = 'garbage';
    const r = readChart(p);
    expect(needsReview(r.issues)).toBe(true);
    expect(r.issues.some((i) => i.path === 'teeth.16' && i.lossy)).toBe(true);
  });
  it('an unrecognised stored value is flagged lossy, not silently reset', () => {
    const p = payload(); p.teeth['11'].mobility = 'm9';
    expect(needsReview(readChart(p).issues)).toBe(true);
  });
  it('an unknown tooth number is flagged lossy, not silently dropped', () => {
    const p = payload(); p.teeth['99'] = {};
    expect(needsReview(readChart(p).issues)).toBe(true);
  });
  it('a clean chart and a tooth that is simply not recorded do not need review', () => {
    expect(needsReview(readChart(payload()).issues)).toBe(false);
    const p = payload(); delete p.teeth['18'];
    expect(needsReview(readChart(p).issues)).toBe(false);
  });
  it('an unusable payload yields no chart at all', () => {
    expect(readChart('x').chart).toBeNull();
    expect(readChart({ teeth: 5 }).chart).toBeNull();
  });
});

describe('tooth type changes', () => {
  const charted = (): Chart => {
    let c = newChart();
    c = applied(editChart(c, 'status', [16], { kind: 'caries', surface: 'mesial', on: true }));
    c = applied(editChart(c, 'status', [16], { kind: 'note', value: 'sensitive to cold' }));
    c = applied(editChart(c, 'status', [16], { kind: 'enum', field: 'mobility', value: 'm1' }));
    return c;
  };
  it('natural to implant needs confirmation and names what is erased', () => {
    const o = editChart(charted(), 'status', [16], { kind: 'selection', value: 'implant' });
    expect(o.kind).toBe('confirm');
    if (o.kind === 'confirm') expect(o.erases?.[0]?.fields).toContain('caries');
  });
  it('natural to implant keeps note and mobility once confirmed, drops caries', () => {
    const c = applied(editChart(charted(), 'status', [16], { kind: 'selection', value: 'implant' }, { erasureConfirmed: true }));
    const t = c.status.get(16)!;
    expect(t.toothSelection).toBe('implant');
    expect(t.note).toBe('sensitive to cold');
    expect(t.mobility).toBe('m1');
    expect(t.caries.size).toBe(0);
  });
  it('natural to missing needs confirmation but keeps the note', () => {
    expect(editChart(charted(), 'status', [16], { kind: 'selection', value: 'none' }).kind).toBe('confirm');
    const t = applied(editChart(charted(), 'status', [16], { kind: 'selection', value: 'none' }, { erasureConfirmed: true })).status.get(16)!;
    expect(t.note).toBe('sensitive to cold');
    expect(t.mobility).toBe('none');
  });
  it('natural to deciduous loses nothing and needs no confirmation', () => {
    const c = applied(editChart(charted(), 'status', [11], { kind: 'caries', surface: 'distal', on: true }));
    const o = editChart(c, 'status', [11], { kind: 'selection', value: 'milktooth' });
    const t = applied(o).status.get(11)!;
    expect(t.toothSelection).toBe('milktooth');
    expect(t.caries.has('caries-distal')).toBe(true);
  });
  it('missing to present needs no confirmation (nothing recorded to lose)', () => {
    const c = applied(editChart(newChart(), 'status', [16], { kind: 'selection', value: 'none' }));
    expect(editChart(c, 'status', [16], { kind: 'selection', value: 'tooth-base' }).kind).toBe('applied');
  });
  it('an unconfirmed change leaves the chart untouched', () => {
    const c = charted();
    editChart(c, 'status', [16], { kind: 'selection', value: 'implant' });
    expect(c.status.get(16)!.caries.has('caries-mesial')).toBe(true);
  });
  it('a tooth with nothing recorded changes type without asking', () => {
    expect(editChart(newChart(), 'status', [16], { kind: 'selection', value: 'implant' }).kind).toBe('applied');
  });
  it('deciduous stays blocked on second-dentition molars', () => {
    expect(applyEdit(defaultState(), 16, { kind: 'selection', value: 'milktooth' }).ok).toBe(false);
  });
});

describe('history and round trips', () => {
  it('a saved examination does not change when the working chart is edited afterwards', () => {
    let c = applied(editChart(newChart(), 'status', [16], { kind: 'caries', surface: 'mesial', on: true }));
    const exam = makeExamination('p1', c, { id: 'e1', date: '2026-11-01' });
    const frozen = JSON.stringify(exam);
    c = applied(editChart(c, 'status', [16], { kind: 'selection', value: 'implant' }, { erasureConfirmed: true }));
    c = applied(editChart(c, 'status', [11], { kind: 'caries', surface: 'distal', on: true }));
    expect(JSON.stringify(exam)).toBe(frozen);
    expect(readChart(exam.chart).chart!.status.get(16)!.caries.has('caries-mesial')).toBe(true);
  });
  it('write then read keeps every recorded value', () => {
    let c = applied(editChart(newChart(), 'status', [16], { kind: 'perio', site: 'MB', pd: 5, gm: 1, bop: true }));
    c = applied(editChart(c, 'status', [16], { kind: 'note', value: 'x' }));
    const back = readChart(JSON.parse(JSON.stringify(writeChart(c))));
    expect(back.issues).toEqual([]);
    expect(JSON.stringify(writeChart(back.chart!))).toBe(JSON.stringify(writeChart(c)));
  });
});
