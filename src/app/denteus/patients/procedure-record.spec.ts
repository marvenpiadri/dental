import { buildProcedures, scopeText, teethOfScope, type ProcedureDraft } from './procedure-record';

const draft = (o: Partial<ProcedureDraft>): ProcedureDraft => ({ procedure: 'filling', name: 'Filling', price: 400, done: false, date: '2026-11-04', scope: 'teeth', quadrant: 1, teeth: [16, 17], ...o });
let n = 0; const id = () => `id${++n}`;

describe('procedure records', () => {
  it('writes one record per tooth for a tooth scope', () => {
    const r = buildProcedures(draft({}), id);
    expect(r.map((i) => i.tooth)).toEqual(['16', '17']);
  });
  it('keeps a planned procedure planned, and stamps only completed ones', () => {
    expect(buildProcedures(draft({ done: false }), id)[0]).toMatchObject({ status: 'planned' });
    expect(buildProcedures(draft({ done: false }), id)[0].doneAt).toBeUndefined();
    expect(buildProcedures(draft({ done: true }), id)[0].doneAt).toBeDefined();
  });
  it('writes one record for a quadrant, an arch, the mouth or no tooth', () => {
    expect(buildProcedures(draft({ scope: 'quadrant', quadrant: 3 }), id)).toMatchObject([{ scope: 'quadrant', quadrant: 3 }]);
    expect(buildProcedures(draft({ scope: 'upper' }), id)).toHaveLength(1);
    expect(buildProcedures(draft({ scope: 'mouth' }), id)[0].scope).toBe('mouth');
    const none = buildProcedures(draft({ scope: 'none' }), id)[0];
    expect(none.tooth).toBeUndefined(); expect(none.scope).toBeUndefined();
  });
  it('writes nothing for a tooth scope without teeth', () => { expect(buildProcedures(draft({ teeth: [] }), id)).toEqual([]); });
  it('knows which teeth a scope covers', () => {
    expect(teethOfScope('quadrant', 2)).toEqual([21, 22, 23, 24, 25, 26, 27, 28]);
    expect(teethOfScope('upper')).toHaveLength(16);
    expect(teethOfScope('lower').every((t) => t >= 31)).toBe(true);
    expect(teethOfScope('mouth')).toHaveLength(32);
    expect(teethOfScope('none')).toEqual([]);
  });
  it('labels the tooth column', () => {
    const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}:${p['n']}` : k);
    expect(scopeText({ id: 'a', procedure: 'x', price: 0, status: 'planned', tooth: '16' }, t as never)).toBe('16');
    expect(scopeText({ id: 'a', procedure: 'x', price: 0, status: 'planned', scope: 'quadrant', quadrant: 2 }, t as never)).toBe('procedure.quadrant:2');
    expect(scopeText({ id: 'a', procedure: 'x', price: 0, status: 'planned' }, t as never)).toBe('—');
  });
});
