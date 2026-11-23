import { describe, expect, test } from 'bun:test';
import { currentMonthBounds, currentMonthLabel } from '../src/lib/dates';

describe('currentMonthBounds', () => {
  test('test_current_month_bounds_use_local_calendar_dates', () => {
    // A year boundary: the last day of December stays in December.
    expect(currentMonthBounds(new Date(2025, 11, 31, 23, 59, 59))).toEqual({
      dateFrom: '2025-12-01',
      dateTo: '2025-12-31',
    });
    // The first day of January stays in January.
    expect(currentMonthBounds(new Date(2026, 0, 1, 0, 0, 1))).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    // Local month lengths, including leap February and a 30-day month.
    expect(currentMonthBounds(new Date(2024, 1, 14))).toEqual({
      dateFrom: '2024-02-01',
      dateTo: '2024-02-29',
    });
    expect(currentMonthBounds(new Date(2026, 3, 2))).toEqual({
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
    });
  });

  test('test_current_month_label_matches_the_same_local_month', () => {
    expect(currentMonthLabel(new Date(2026, 0, 1))).toBe('January 2026');
    expect(currentMonthLabel(new Date(2025, 11, 31))).toBe('December 2025');
  });
});
