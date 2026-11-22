import { describe, expect, test } from 'bun:test';
import {
  filterTransactions,
  type TransactionFilters,
} from '../src/lib/transactionFilters';
import type { Transaction } from '../src/storage';

function makeTransaction(
  overrides: Pick<Transaction, 'id' | 'type' | 'amountMinor' | 'date' | 'categoryId'> &
    Partial<Transaction>
): Transaction {
  return { description: null, createdAt: 0, ...overrides };
}

describe('filterTransactions', () => {
  test('test_transaction_filters_combine_and_include_date_bounds', () => {
    const transactions: Transaction[] = [
      makeTransaction({ id: 1, type: 'income', amountMinor: 50000, date: '2026-01-01', categoryId: 9 }),
      makeTransaction({ id: 2, type: 'expense', amountMinor: 1000, date: '2026-01-14', categoryId: 2 }),
      makeTransaction({ id: 3, type: 'expense', amountMinor: 2000, date: '2026-01-15', categoryId: 2 }),
      makeTransaction({ id: 4, type: 'income', amountMinor: 7000, date: '2026-01-18', categoryId: 2 }),
      makeTransaction({ id: 5, type: 'expense', amountMinor: 3000, date: '2026-01-31', categoryId: 2 }),
      makeTransaction({ id: 6, type: 'expense', amountMinor: 4000, date: '2026-02-01', categoryId: 2 }),
      makeTransaction({ id: 7, type: 'expense', amountMinor: 5000, date: '2026-01-20', categoryId: 3 }),
    ];
    const snapshot = [...transactions];

    // All three filters combine; both the start and end dates are inclusive.
    const filters: TransactionFilters = {
      type: 'expense',
      categoryId: 2,
      dateFrom: '2026-01-15',
      dateTo: '2026-01-31',
    };
    const result = filterTransactions(transactions, filters);
    expect(result.map((t) => t.id)).toEqual([3, 5]);
    expect(result).not.toBe(transactions);

    // A single-day range includes transactions on that exact day.
    expect(
      filterTransactions(transactions, { dateFrom: '2026-01-15', dateTo: '2026-01-15' }).map(
        (t) => t.id
      )
    ).toEqual([3]);

    // One-sided bounds work independently.
    expect(filterTransactions(transactions, { dateFrom: '2026-02-01' }).map((t) => t.id)).toEqual([6]);
    expect(filterTransactions(transactions, { dateTo: '2026-01-01' }).map((t) => t.id)).toEqual([1]);

    // Empty match returns a new, empty list and never mutates the source.
    const empty = filterTransactions(transactions, { categoryId: 999 });
    expect(empty).toEqual([]);
    expect(empty).not.toBe(transactions);
    expect(transactions).toEqual(snapshot);

    // Malformed calendar dates and reversed ranges are rejected with RangeError.
    const invalidRanges: Array<[string | undefined, string | undefined]> = [
      ['2026-02-30', undefined],
      [undefined, 'not-a-date'],
      ['2026/01/15', '2026-01-31'],
      ['2026-01-31', '2026-01-15'],
      ['2026-13-01', '2026-13-31'],
    ];
    for (const [dateFrom, dateTo] of invalidRanges) {
      expect(() => filterTransactions(transactions, { dateFrom, dateTo })).toThrow(RangeError);
    }
  });

  test('returns every transaction for empty filters', () => {
    const transactions: Transaction[] = [
      makeTransaction({ id: 1, type: 'income', amountMinor: 100, date: '2026-01-01', categoryId: 1 }),
      makeTransaction({ id: 2, type: 'expense', amountMinor: 50, date: '2026-01-02', categoryId: 2 }),
    ];
    expect(filterTransactions(transactions, {})).toEqual(transactions);
    expect(filterTransactions(transactions)).toEqual(transactions);
  });
});
