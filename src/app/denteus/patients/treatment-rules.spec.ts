import { TreatmentItem } from '../models/dental.models';
import { parsePrice, planTotals } from './treatment-rules';

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
