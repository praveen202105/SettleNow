import { describe, expect, it } from 'vitest';

import { formatDate, isIsoDate, todayIsoLocal } from '../../../packages/shared/src/date.js';

describe('date-only helpers', () => {
  it('validates calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
  });

  it('uses local date fields instead of UTC conversion', () => {
    const localDate = new Date(2026, 7, 8, 0, 30);
    expect(todayIsoLocal(localDate)).toBe('2026-08-08');
  });

  it('formats a date-only value without shifting it', () => {
    expect(formatDate('2026-08-08')).toContain('2026');
  });
});
