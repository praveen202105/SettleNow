import { describe, expect, it } from 'vitest';

import {
  MoneyParseError,
  centsToInput,
  formatUsd,
  parseMoneyToCents,
} from '../../../packages/shared/src/money.js';

describe('money helpers', () => {
  it.each([
    ['0', 0],
    ['0.01', 1],
    ['400', 40_000],
    ['1000.5', 100_050],
  ])('parses %s without floating point arithmetic', (value, cents) => {
    expect(parseMoneyToCents(value)).toBe(cents);
  });

  it.each(['', '-1', '1.001', '1e3', '01.00'])('rejects invalid input %s', (value) => {
    expect(() => parseMoneyToCents(value)).toThrow(MoneyParseError);
  });

  it('formats values for forms and display', () => {
    expect(centsToInput(100_050)).toBe('1000.50');
    expect(formatUsd(100_050)).toBe('$1,000.50');
  });
});
