import { applyRevs, diffChart, toTreatmentItem, type ChartRevs } from './clinical-api.service';

const revs = (o: Partial<ChartRevs> = {}): ChartRevs => ({ teeth: { '11': 3, '12': 1 }, plan: {}, globals: 2, case: 0, ...o });
const tooth = (status: string) => ({ status });

describe('diffChart (unit)', () => {
  const prev = { version: '2.22', globals: { a: true }, teeth: { '11': tooth('ok'), '12': tooth('missing') } };

  it('sends nothing when nothing changed', () => {
    expect(diffChart(prev, structuredClone(prev), revs())).toEqual([]);
  });
  it('sends only the tooth that changed, with the revision it was read at; never the whole chart', () => {
    const next = { ...structuredClone(prev), teeth: { '11': tooth('crown'), '12': tooth('missing') } };
    expect(diffChart(prev, next, revs())).toEqual([{ scope: 'teeth', tooth: '11', expectedRev: 3, replace: { status: 'crown' } }]);
  });
  it('a new tooth starts at revision 0; a tooth that vanished is cleared', () => {
    const next = { ...structuredClone(prev), teeth: { '11': tooth('ok'), '13': tooth('filling') } };
    expect(diffChart(prev, next, revs())).toEqual([
      { scope: 'teeth', tooth: '13', expectedRev: 0, replace: { status: 'filling' } },
      { scope: 'teeth', tooth: '12', expectedRev: 1, clear: true },
    ]);
  });
  it('the plan layer and the case are separate parts with their own revisions', () => {
    const next = { ...structuredClone(prev), plan: { '11': tooth('planned') }, case: { dentist: 'A' } };
    expect(diffChart(prev, next, revs({ plan: {}, case: 4 }))).toEqual([
      { scope: 'plan', tooth: '11', expectedRev: 0, replace: { status: 'planned' } },
      { scope: 'case', expectedRev: 4, replace: { dentist: 'A' } },
    ]);
    const back = diffChart(next, prev, revs({ plan: { '11': 2 }, case: 4 }));
    expect(back).toEqual([{ scope: 'plan', tooth: '11', expectedRev: 2, clear: true }, { scope: 'case', expectedRev: 4, clear: true }]);
  });
  it('a changed global switch is sent as a whole booleans section', () => {
    expect(diffChart(prev, { ...structuredClone(prev), globals: { a: false } }, revs())).toEqual([{ scope: 'globals', expectedRev: 2, replace: { a: false } }]);
  });
  it('a tooth reduced to nothing is cleared, not replaced with an empty record the server would refuse', () => {
    expect(diffChart(prev, { ...structuredClone(prev), teeth: { '11': {}, '12': tooth('missing') } }, revs())).toEqual([{ scope: 'teeth', tooth: '11', expectedRev: 3, clear: true }]);
  });
});

describe('applyRevs (unit)', () => {
  it('records the revisions the server returned, leaving the rest', () => {
    const r = applyRevs(revs(), [{ scope: 'teeth', tooth: '11', rev: 4 }, { scope: 'globals', tooth: null, rev: 3 }, { scope: 'plan', tooth: '16', rev: 1 }]);
    expect(r).toEqual({ teeth: { '11': 4, '12': 1 }, plan: { '16': 1 }, globals: 3, case: 0 });
  });
});

describe('toTreatmentItem (unit)', () => {
  it('turns the server row into the app item: numbers, absent keys, and a currency only when it differs from the clinic\'s', () => {
    const row = { id: 'i', procedure: 'filling', price: '320.00', status: 'done', tooth: '16', scope: null, quadrant: null, name: null, currency: 'MAD', date: '2026-11-10', doneAt: '2026-11-10T09:00:00Z', appointmentId: null };
    expect(toTreatmentItem(row, 'MAD')).toEqual({ id: 'i', procedure: 'filling', price: 320, status: 'done', tooth: '16', date: '2026-11-10', doneAt: '2026-11-10T09:00:00Z' });
    expect(toTreatmentItem({ ...row, currency: 'EUR' }, 'MAD').currency).toBe('EUR');
  });
});
