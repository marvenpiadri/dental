import { CHILD_LOWER, CHILD_UPPER, LOWER, UPPER } from './tooth-numbers';

describe('tooth lists', () => {
  it('has sixteen adult and ten baby teeth per jaw', () => {
    expect([UPPER.length, LOWER.length, CHILD_UPPER.length, CHILD_LOWER.length]).toEqual([16, 16, 10, 10]);
  });
});
