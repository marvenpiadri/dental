import { changeLabStatus, expiresSoon, implantsInLot, isExpired, isLate, isLow, monthTotal, movementsFor, recordMovement, sortTasks, StockItem, StockMovement, wholeNumber } from './practice-rules';

describe('practice rules', () => {
  it('totals one month of expenses', () => {
    const e = [{ id: '1', day: '2026-10-03', label: 'a', amount: 100 }, { id: '2', day: '2026-10-20', label: 'b', amount: 50 }, { id: '3', day: '2026-09-30', label: 'c', amount: 999 }];
    expect(monthTotal(e, '2026-10')).toBe(150);
  });
  it('flags low stock at or under the alert level', () => {
    expect(isLow({ id: '1', name: 'x', qty: 2, min: 2 })).toBe(true);
    expect(isLow({ id: '1', name: 'x', qty: 3, min: 2 })).toBe(false);
  });
  it('is late only while still at the lab after the due day', () => {
    const o = { id: '1', patientId: 'p', work: 'crown', lab: 'L', due: '2026-10-20', status: 'sent' as const };
    expect(isLate(o, '2026-10-21')).toBe(true);
    expect(isLate(o, '2026-10-20')).toBe(false);
    expect(isLate({ ...o, status: 'ready' }, '2026-10-21')).toBe(false);
  });
  it('reads whole numbers only', () => {
    expect(wholeNumber('12')).toBe(12);
    expect([wholeNumber('1.5'), wholeNumber('-3'), wholeNumber(''), wholeNumber('abc', 7)]).toEqual([0, 0, 0, 7]);
  });
  it('puts open tasks before done ones, keeping order', () => {
    const t = [{ id: 'a', text: '', done: true }, { id: 'b', text: '', done: false }, { id: 'c', text: '', done: false }];
    expect(sortTasks(t).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('finds implants by lot, ignoring case and blanks', () => {
    const r = [{ id: '1', patientId: 'p', tooth: '11', brand: 'B', lot: 'AB12', day: '' }, { id: '2', patientId: 'q', tooth: '21', brand: 'B', lot: 'ZZ', day: '' }];
    expect(implantsInLot(r, ' ab12 ').map((x) => x.id)).toEqual(['1']);
    expect(implantsInLot(r, '')).toEqual([]);
  });
});

describe('stock ledger', () => {
  let n = 0;
  const base = { day: '2026-11-16', by: 'Front desk', newId: () => `m${++n}` };
  const gloves: StockItem = { id: 'g', name: 'Gloves', qty: 10, min: 4 };

  it('receives, uses and wastes; the balance equals the sum of movements', () => {
    let item = gloves, ledger: StockMovement[] = [];
    for (const [kind, amount] of [['in', 20], ['out', 5], ['waste', 2]] as const) {
      const r = recordMovement(item, ledger, { ...base, kind, amount });
      if (!r.ok) throw new Error(r.error);
      item = r.item; ledger = [...ledger, ...r.moves];
    }
    expect(item.qty).toBe(23);
    expect(ledger.reduce((s, m) => s + m.change, 0)).toBe(23); // 10 opening + 20 - 5 - 2
    expect(ledger.map((m) => m.kind)).toEqual(['opening', 'in', 'out', 'waste']);
    expect(ledger.at(-1)?.after).toBe(23);
  });
  it('refuses to use or waste more than is in stock, and zero or fractional amounts', () => {
    expect(recordMovement(gloves, [], { ...base, kind: 'out', amount: 11 })).toEqual({ ok: false, error: 'insufficient' });
    expect(recordMovement(gloves, [], { ...base, kind: 'waste', amount: 11 })).toEqual({ ok: false, error: 'insufficient' });
    expect(recordMovement(gloves, [], { ...base, kind: 'in', amount: 0 })).toEqual({ ok: false, error: 'amount' });
    expect(recordMovement(gloves, [], { ...base, kind: 'in', amount: 1.5 })).toEqual({ ok: false, error: 'amount' });
  });
  it('a count needs a reason, sets the quantity, and records the difference', () => {
    expect(recordMovement(gloves, [], { ...base, kind: 'adjust', amount: 7 })).toEqual({ ok: false, error: 'reason' });
    expect(recordMovement(gloves, [], { ...base, kind: 'adjust', amount: 10, reason: 'same' })).toEqual({ ok: false, error: 'amount' }); // nothing changed
    const r = recordMovement(gloves, [], { ...base, kind: 'adjust', amount: 7, reason: ' Counted after audit ' });
    expect(r).toMatchObject({ ok: true, item: { qty: 7 } });
    if (r.ok) expect(r.moves.at(-1)).toMatchObject({ kind: 'adjust', change: -3, after: 7, reason: 'Counted after audit' });
    expect(recordMovement(gloves, [], { ...base, kind: 'adjust', amount: 0, reason: 'none left' })).toMatchObject({ ok: true, item: { qty: 0 } });
  });
  it('gives existing stock an opening line only when the history does not add up', () => {
    const r = recordMovement(gloves, [], { ...base, kind: 'out', amount: 1 });
    expect(r.ok && r.moves[0]).toMatchObject({ kind: 'opening', change: 10, after: 10 });
    const withHistory = recordMovement({ ...gloves, qty: 9 }, [{ id: 'x', itemId: 'g', day: 'd', kind: 'opening', change: 10, after: 10, by: 'b' }, { id: 'y', itemId: 'g', day: 'd', kind: 'out', change: -1, after: 9, by: 'b' }], { ...base, kind: 'out', amount: 1 });
    expect(withHistory.ok && withHistory.moves.map((m) => m.kind)).toEqual(['out']);
  });
  it('lists one item\'s movements newest first and bounded', () => {
    const ledger = Array.from({ length: 30 }, (_, i): StockMovement => ({ id: `${i}`, itemId: i % 2 ? 'a' : 'b', day: 'd', kind: 'in', change: 1, after: i, by: 'x' }));
    const a = movementsFor(ledger, 'a', 5);
    expect(a.map((m) => m.id)).toEqual(['29', '27', '25', '23', '21']);
  });
  it('flags expired and soon-to-expire stock by calendar day', () => {
    const item = (expires?: string): StockItem => ({ ...gloves, expires });
    expect(isExpired(item('2026-11-15'), '2026-11-16')).toBe(true);
    expect(isExpired(item('2026-11-16'), '2026-11-16')).toBe(false); // usable through its expiry day
    expect(expiresSoon(item('2026-12-31'), '2026-11-16')).toBe(true);
    expect(expiresSoon(item('2027-03-01'), '2026-11-16')).toBe(false);
    expect(expiresSoon(item('2026-11-01'), '2026-11-16')).toBe(false); // already expired, not "soon"
    expect(isExpired(item(undefined), '2026-11-16') || expiresSoon(item('garbage'), '2026-11-16')).toBe(false);
  });
});

describe('lab status', () => {
  const o = { id: 'l1', patientId: 'p', work: 'Crown', lab: 'X', due: '2026-10-20', status: 'sent' as const };
  const by = { day: '2026-10-22', who: 'Dr A' };
  it('logs each change and keeps the earlier ones', () => {
    const r = changeLabStatus(o, 'ready', by);
    expect(r.ok && r.order.history).toEqual([{ day: '2026-10-22', status: 'ready', by: 'Dr A' }]);
  });
  it('needs a reason to remake or cancel', () => {
    expect(changeLabStatus(o, 'remake', by)).toEqual({ ok: false, error: 'note' });
    const r = changeLabStatus(o, 'remake', { ...by, note: ' bad margin ' });
    expect(r.ok && r.order.history?.[0].note).toBe('bad margin');
  });
  it('closed orders and no-op changes are refused', () => {
    expect(changeLabStatus({ ...o, status: 'fitted' }, 'ready', by)).toEqual({ ok: false, error: 'closed' });
    expect(changeLabStatus(o, 'sent', by)).toEqual({ ok: false, error: 'same' });
  });
  it('a remade order is late again after its due day', () => { expect(isLate({ ...o, status: 'remake' }, '2026-10-21')).toBe(true); });
});
