import { TreatmentItem } from '../models/dental.models';
import { balance, defaultCatalog, parsePrice, planTotals, procedureName } from './treatment-rules';

const item = (price: number, status: TreatmentItem['status']): TreatmentItem => ({ id: String(price) + status, procedure: 'filling', price, status });

describe('planTotals', () => {
  it('splits planned from done', () => {
    expect(planTotals([item(400, 'planned'), item(300, 'done'), item(100, 'planned')])).toEqual({ planned: 500, done: 300, total: 800 });
  });
  it('is zero for an empty plan', () => {
    expect(planTotals([])).toEqual({ planned: 0, done: 0, total: 0 });
  });
});

describe('parsePrice', () => {
  it('reads plain, spaced and comma amounts', () => {
    expect(parsePrice('1200')).toBe(1200);
    expect(parsePrice('1 200')).toBe(1200);
    expect(parsePrice('1200,50')).toBe(1201);
    expect(parsePrice('0')).toBe(0);
  });
  it('rejects anything else', () => {
    for (const bad of ['', 'abc', '-5', '12a', '1.2.3']) expect(parsePrice(bad)).toBeNull();
  });
});

describe('balance', () => {
  const pay = (amount: number) => ({ id: String(amount), amount, method: 'cash' as const, at: '2026-10-23T10:00:00Z' });
  it('charges only done work', () => {
    expect(balance([item(400, 'planned'), item(300, 'done')], [pay(100)])).toEqual({ charged: 300, paid: 100, due: 200 });
  });
  it('goes negative when paid ahead', () => {
    expect(balance([item(300, 'done')], [pay(500)]).due).toBe(-200);
  });
});

describe('catalog', () => {
  const t = (key: string) => `[${key}]`;
  it('starts with the built-in acts and their prices', () => {
    expect(defaultCatalog()).toContainEqual({ id: 'crown', price: 2500 });
    expect(defaultCatalog()).toHaveLength(8);
  });
  it('names an act by its own name, else its translation, else its id', () => {
    expect(procedureName(t, 'crown', 'Zirconia crown')).toBe('Zirconia crown');
    expect(procedureName(t, 'crown')).toBe('[proc.crown]');
    expect(procedureName(t, 'custom-id')).toBe('custom-id');
  });
});
