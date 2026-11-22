import { describe, expect, test } from 'bun:test';
import {
  summarizeTransactions,
  type DashboardSummary,
} from '../src/lib/summaries';
import type { Category, Transaction } from '../src/storage';

function makeTransaction(
  overrides: Pick<Transaction, 'id' | 'type' | 'amountMinor' | 'date' | 'categoryId'> &
    Partial<Transaction>
): Transaction {
  return { description: null, createdAt: 0, ...overrides };
}

const CATEGORIES: Category[] = [
  { id: 1, type: 'expense', name: 'Groceries', isBuiltin: false },
  { id: 2, type: 'expense', name: 'Transport', isBuiltin: false },
  { id: 3, type: 'expense', name: 'Utilities', isBuiltin: false },
  { id: 4, type: 'income', name: 'Salary', isBuiltin: false },
];

describe('summarizeTransactions', () => {
  test('test_summary_calculates_lifetime_balance_and_period_expenses', () => {
    const transactions: Transaction[] = [
      makeTransaction({ id: 1, type: 'income', amountMinor: 50000, date: '2025-12-15', categoryId: 4 }),
      makeTransaction({ id: 2, type: 'income', amountMinor: 2000, date: '2026-01-01', categoryId: 4 }),
      makeTransaction({ id: 3, type: 'income', amountMinor: 100000, date: '2026-01-05', categoryId: 4 }),
      makeTransaction({ id: 4, type: 'expense', amountMinor: 20000, date: '2026-01-10', categoryId: 1 }),
      makeTransaction({ id: 5, type: 'expense', amountMinor: 10000, date: '2026-01-20', categoryId: 1 }),
      makeTransaction({ id: 6, type: 'expense', amountMinor: 30000, date: '2026-01-22', categoryId: 2 }),
      makeTransaction({ id: 7, type: 'expense', amountMinor: 5000, date: '2026-01-25', categoryId: 3 }),
      makeTransaction({ id: 8, type: 'expense', amountMinor: 1000, date: '2026-01-31', categoryId: 3 }),
      makeTransaction({ id: 9, type: 'expense', amountMinor: 3000, date: '2026-02-05', categoryId: 3 }),
    ];
    const categories = [...CATEGORIES];
    const transactionsSnapshot = [...transactions];
    const categoriesSnapshot = [...categories];

    const summary: DashboardSummary = summarizeTransactions(
      transactions,
      categories,
      '2026-01-01',
      '2026-01-31'
    );

    // Lifetime income minus lifetime expense, including rows outside the period.
    expect(summary.balanceMinor).toBe(83000);
    // Only period rows contribute to period totals; both bounds are inclusive.
    expect(summary.periodIncomeMinor).toBe(102000);
    expect(summary.periodExpenseMinor).toBe(66000);
    // Grouped by category, ordered by amount descending then category name ascending.
    expect(summary.expenseByCategory).toEqual([
      { categoryId: 1, categoryName: 'Groceries', amountMinor: 30000 },
      { categoryId: 2, categoryName: 'Transport', amountMinor: 30000 },
      { categoryId: 3, categoryName: 'Utilities', amountMinor: 6000 },
    ]);

    // Pure: inputs are never mutated.
    expect(transactions).toEqual(transactionsSnapshot);
    expect(categories).toEqual(categoriesSnapshot);
  });

  test('test_summary_rejects_unsafe_integer_totals', () => {
    const huge = Number.MAX_SAFE_INTEGER;

    // Two safe incomes overflow the income total.
    const overflowingIncome: Transaction[] = [
      makeTransaction({ id: 1, type: 'income', amountMinor: huge, date: '2026-01-10', categoryId: 4 }),
      makeTransaction({ id: 2, type: 'income', amountMinor: 1, date: '2026-01-11', categoryId: 4 }),
    ];
    expect(() =>
      summarizeTransactions(overflowingIncome, CATEGORIES, '2026-01-01', '2026-01-31')
    ).toThrow(RangeError);

    // Lifetime balance stays safe, but the period expense/category total overflows.
    const overflowingExpense: Transaction[] = [
      makeTransaction({ id: 1, type: 'income', amountMinor: huge, date: '2025-12-01', categoryId: 4 }),
      makeTransaction({ id: 2, type: 'expense', amountMinor: huge, date: '2026-01-10', categoryId: 1 }),
      makeTransaction({ id: 3, type: 'expense', amountMinor: 1, date: '2026-01-11', categoryId: 1 }),
    ];
    expect(() =>
      summarizeTransactions(overflowingExpense, CATEGORIES, '2026-01-01', '2026-01-31')
    ).toThrow(RangeError);

    // A single non-safe input amount is rejected instead of producing a rounded total.
    const unsafeInput: Transaction[] = [
      makeTransaction({
        id: 1,
        type: 'income',
        amountMinor: huge + 1,
        date: '2026-01-10',
        categoryId: 4,
      }),
    ];
    expect(() =>
      summarizeTransactions(unsafeInput, CATEGORIES, '2026-01-01', '2026-01-31')
    ).toThrow(RangeError);
  });
});
