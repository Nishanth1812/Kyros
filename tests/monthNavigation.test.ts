import { describe, expect, it } from 'bun:test';
import { getMonthScope, shiftMonth, type MonthScope } from '../src/lib/analytics';
import { summarizeTransactions } from '../src/lib/summaries';
import type { Category, Transaction } from '../src/storage';

describe('Month Navigation and Multi-Month Summary Recalculation', () => {
  const categories: Category[] = [
    { id: 1, type: 'expense', name: 'Food', isBuiltin: true },
    { id: 2, type: 'income', name: 'Salary', isBuiltin: true },
  ];

  it('correctly shifts through calendar months and year boundaries', () => {
    let scope: MonthScope = getMonthScope(new Date(2026, 11, 15)); // Dec 2026
    expect(scope.label).toBe('December 2026');

    scope = shiftMonth(scope, 1);
    expect(scope.label).toBe('January 2027');
    expect(scope.dateFrom).toBe('2027-01-01');

    scope = shiftMonth(scope, -2);
    expect(scope.label).toBe('November 2026');
    expect(scope.dateTo).toBe('2026-11-30');
  });

  it('recalculates monthly totals accurately when navigating between months', () => {
    const transactions: Transaction[] = [
      {
        id: 1,
        type: 'expense',
        amountMinor: 250000,
        date: '2026-10-15',
        description: 'Oct groceries',
        createdAt: 1000,
        categoryId: 1,
      },
      {
        id: 2,
        type: 'expense',
        amountMinor: 400000,
        date: '2026-11-15',
        description: 'Nov groceries',
        createdAt: 2000,
        categoryId: 1,
      },
    ];

    const octScope = getMonthScope(new Date(2026, 9, 1));
    const octSummary = summarizeTransactions(transactions, categories, octScope.dateFrom, octScope.dateTo);
    expect(octSummary.periodExpenseMinor).toBe(250000);

    const novScope = getMonthScope(new Date(2026, 10, 1));
    const novSummary = summarizeTransactions(transactions, categories, novScope.dateFrom, novScope.dateTo);
    expect(novSummary.periodExpenseMinor).toBe(400000);
  });
});
