import { test, expect } from '@playwright/test';
import { score } from '../fuzzy.js';

test.describe('fuzzy scorer', () => {
  test('empty query returns 0', () => {
    expect(score('', 'anything')).toBe(0);
  });

  test('exact match returns 1.0', () => {
    expect(score('billing', 'billing')).toBe(1.0);
  });

  test('prefix match returns 1.0', () => {
    expect(score('bil', 'billing')).toBe(1.0);
  });

  test('case insensitive', () => {
    expect(score('BIL', 'Billing')).toBe(1.0);
  });

  test('chars not present returns 0', () => {
    expect(score('xyz', 'billing')).toBe(0);
  });

  test('chars present but out of order returns 0', () => {
    expect(score('gnilli', 'billing')).toBe(0);
  });

  test('scattered match returns score > 0', () => {
    const s = score('bg', 'billing page');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1.0);
  });

  test('consecutive match scores higher than scattered', () => {
    const consecutive = score('bil', 'billing stats');
    const scattered = score('bls', 'billing stats');
    expect(consecutive).toBeGreaterThan(scattered);
  });

  test('word boundary bonus applies', () => {
    const boundary = score('s', 'sign in');
    const midword = score('i', 'sign in');
    expect(boundary).toBeGreaterThanOrEqual(midword);
  });

  test('partial match with all chars in order returns score > 0', () => {
    expect(score('btn', 'submit button')).toBeGreaterThan(0);
  });

  test('score is clamped to [0, 1]', () => {
    const s = score('a', 'a');
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});
