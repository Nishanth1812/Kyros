import { describe, expect, test } from 'bun:test';
import { calculateBudgetProgress } from '../src/lib/budgetProgress';
import { currentMonthBounds } from '../src/lib/dates';
import { summarizeTransactions } from '../src/lib/summaries';
import type { Budget, Category, Transaction } from '../src/storage';

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

describe('calculateBudgetProgress', () => {
  test('test_budget_progress_matches_expense_history_and_excludes_income', () => {
    const budgets: Budget[] = [
      { id: 1, categoryId: null, amountMinor: 100000 },
      { id: 2, categoryId: 1, amountMinor: 40000 },
      { id: 3, categoryId: 2, amountMinor: 10000 },
    ];
    const transactions: Transaction[] = [
      makeTransaction({ id: 1, type: 'income', amountMinor: 500000, date: '2026-01-01', categoryId: 4 }),
      makeTransaction({ id: 2, type: 'expense', amountMinor: 20000, date: '2026-01-01', categoryId: 1 }),
      makeTransaction({ id: 3, type: 'expense', amountMinor: 15000, date: '2026-01-15', categoryId: 1 }),
      makeTransaction({ id: 4, type: 'expense', amountMinor: 30000, date: '2026-01-31', categoryId: 2 }),
      makeTransaction({ id: 5, type: 'expense', amountMinor: 5000, date: '2026-01-31', categoryId: 3 }),
      makeTransaction({ id: 6, type: 'income', amountMinor: 10000, date: '2026-01-20', categoryId: 4 }),
      makeTransaction({ id: 7, type: 'expense', amountMinor: 70000, date: '2025-12-31', categoryId: 1 }),
      makeTransaction({ id: 8, type: 'expense', amountMinor: 80000, date: '2026-02-01', categoryId: 1 }),
    ];
    const budgetsSnapshot = [...budgets];
    const transactionsSnapshot = [...transactions];

    const progress = calculateBudgetProgress(
      budgets,
      transactions,
      '2026-01-01',
      '2026-01-31'
    );

    // Overall actual is all in-month expenses; each category actual is only
    // that category's expenses. Income and adjacent months never contribute.
    expect(progress).toEqual([
      { id: 1, categoryId: null, budgetMinor: 100000, spentMinor: 70000, remainingMinor: 30000 },
      { id: 2, categoryId: 1, budgetMinor: 40000, spentMinor: 35000, remainingMinor: 5000 },
      { id: 3, categoryId: 2, budgetMinor: 10000, spentMinor: 30000, remainingMinor: -20000 },
    ]);

    // Same month, same stored rows as the dashboard/History summary.
    const summary = summarizeTransactions(
      transactions,
      CATEGORIES,
      '2026-01-01',
      '2026-01-31'
    );
    expect(progress[0].spentMinor).toBe(summary.periodExpenseMinor);
    expect(progress[1].spentMinor).toBe(
      summary.expenseByCategory.find((entry) => entry.categoryId === 1)?.amountMinor
    );
    expect(progress[2].spentMinor).toBe(
      summary.expenseByCategory.find((entry) => entry.categoryId === 2)?.amountMinor
    );

    // Pure: the saved budgets and transaction history are untouched.
    expect(budgets).toEqual(budgetsSnapshot);
    expect(transactions).toEqual(transactionsSnapshot);
  });

  test('test_budget_progress_includes_first_and_last_day_of_the_month', () => {
    const bounds = currentMonthBounds(new Date(2026, 5, 15));
    const budgets: Budget[] = [
      { id: 1, categoryId: null, amountMinor: 1000 },
      { id: 2, categoryId: 1, amountMinor: 1000 },
    ];
    const transactions: Transaction[] = [
      makeTransaction({ id: 1, type: 'expense', amountMinor: 100, date: bounds.dateFrom, categoryId: 1 }),
      makeTransaction({ id: 2, type: 'expense', amountMinor: 200, date: bounds.dateTo, categoryId: 1 }),
      makeTransaction({ id: 3, type: 'expense', amountMinor: 999, date: '2026-05-31', categoryId: 1 }),
      makeTransaction({ id: 4, type: 'expense', amountMinor: 999, date: '2026-07-01', categoryId: 1 }),
    ];

    const progress = calculateBudgetProgress(
      budgets,
      transactions,
      bounds.dateFrom,
      bounds.dateTo
    );

    expect(progress.map((entry) => entry.spentMinor)).toEqual([300, 300]);
  });

  test('test_budget_progress_handles_no_activity_and_no_budget', () => {
    const budgets: Budget[] = [
      { id: 1, categoryId: null, amountMinor: 10000 },
      { id: 2, categoryId: 1, amountMinor: 5000 },
    ];

    expect(
      calculateBudgetProgress(budgets, [], '2026-01-01', '2026-01-31')
    ).toEqual([
      { id: 1, categoryId: null, budgetMinor: 10000, spentMinor: 0, remainingMinor: 10000 },
      { id: 2, categoryId: 1, budgetMinor: 5000, spentMinor: 0, remainingMinor: 5000 },
    ]);

    // With no saved limits there are no rows to render, even with expenses.
    const expenses = [
      makeTransaction({ id: 1, type: 'expense', amountMinor: 100, date: '2026-01-10', categoryId: 1 }),
    ];
    expect(
      calculateBudgetProgress([], expenses, '2026-01-01', '2026-01-31')
    ).toEqual([]);
  });

  test('test_budget_progress_reports_exact_negative_remaining_when_overspent', () => {
    const budgets: Budget[] = [
      { id: 1, categoryId: null, amountMinor: 1000 },
      { id: 2, categoryId: 1, amountMinor: 100 },
    ];
    const transactions: Transaction[] = [
      makeTransaction({ id: 1, type: 'expense', amountMinor: 600, date: '2026-01-10', categoryId: 1 }),
      makeTransaction({ id: 2, type: 'expense', amountMinor: 500, date: '2026-01-20', categoryId: 2 }),
    ];

    const progress = calculateBudgetProgress(
      budgets,
      transactions,
      '2026-01-01',
      '2026-01-31'
    );

    expect(progress).toEqual([
      { id: 1, categoryId: null, budgetMinor: 1000, spentMinor: 1100, remainingMinor: -100 },
      { id: 2, categoryId: 1, budgetMinor: 100, spentMinor: 600, remainingMinor: -500 },
    ]);
  });

  test('test_budget_progress_rejects_unsafe_totals', () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const budgets: Budget[] = [{ id: 1, categoryId: null, amountMinor: 1000 }];
    const transactions: Transaction[] = [
      makeTransaction({ id: 1, type: 'expense', amountMinor: huge, date: '2026-01-10', categoryId: 1 }),
      makeTransaction({ id: 2, type: 'expense', amountMinor: 1, date: '2026-01-11', categoryId: 1 }),
    ];

    expect(() =>
      calculateBudgetProgress(budgets, transactions, '2026-01-01', '2026-01-31')
    ).toThrow(RangeError);
  });
});
