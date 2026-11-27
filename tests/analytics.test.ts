import { describe, expect, it } from 'bun:test';
import {
  calculateMonthAnalytics,
  calculateMultiMonthTrends,
  getMonthScope,
  shiftMonth,
} from '../src/lib/analytics';
import type { Category, Transaction } from '../src/storage';

describe('analytics engine', () => {
  const categories: Category[] = [
    { id: 1, type: 'expense', name: 'Food', isBuiltin: true },
    { id: 2, type: 'expense', name: 'Transport', isBuiltin: true },
    { id: 3, type: 'income', name: 'Salary', isBuiltin: true },
  ];

  it('getMonthScope returns correct bounds and label for a given date', () => {
    const scope = getMonthScope(new Date(2026, 10, 15)); // November 2026
    expect(scope.year).toBe(2026);
    expect(scope.month).toBe(11);
    expect(scope.label).toBe('November 2026');
    expect(scope.dateFrom).toBe('2026-11-01');
    expect(scope.dateTo).toBe('2026-11-30');
  });

  it('shiftMonth shifts forward and backward across year boundaries', () => {
    const nov2026 = getMonthScope(new Date(2026, 10, 1));
    const dec2026 = shiftMonth(nov2026, 1);
    expect(dec2026.year).toBe(2026);
    expect(dec2026.month).toBe(12);
    expect(dec2026.label).toBe('December 2026');
    expect(dec2026.dateTo).toBe('2026-12-31');

    const jan2027 = shiftMonth(dec2026, 1);
    expect(jan2027.year).toBe(2027);
    expect(jan2027.month).toBe(1);
    expect(jan2027.label).toBe('January 2027');

    const oct2026 = shiftMonth(nov2026, -1);
    expect(oct2026.month).toBe(10);
    expect(oct2026.dateTo).toBe('2026-10-31');
  });

  it('calculates monthly totals, breakdowns, and percentages', () => {
    const scope = getMonthScope(new Date(2026, 10, 1)); // Nov 2026
    const transactions: Transaction[] = [
      {
        id: 1,
        type: 'income',
        amountMinor: 10000000, // ₹100,000
        date: '2026-11-01',
        description: 'Paycheck',
        createdAt: 1000,
        categoryId: 3,
      },
      {
        id: 2,
        type: 'expense',
        amountMinor: 3000000, // ₹30,000
        date: '2026-11-10',
        description: 'Groceries',
        createdAt: 2000,
        categoryId: 1,
      },
      {
        id: 3,
        type: 'expense',
        amountMinor: 1000000, // ₹10,000
        date: '2026-11-15',
        description: 'Taxi',
        createdAt: 3000,
        categoryId: 2,
      },
      // Previous month transaction (must be excluded)
      {
        id: 4,
        type: 'expense',
        amountMinor: 500000,
        date: '2026-10-31',
        description: 'Old lunch',
        createdAt: 4000,
        categoryId: 1,
      },
    ];

    const analytics = calculateMonthAnalytics(transactions, categories, scope);

    expect(analytics.totalIncomeMinor).toBe(10000000);
    expect(analytics.totalExpenseMinor).toBe(4000000); // 30k + 10k
    expect(analytics.netBalanceMinor).toBe(6000000);
    expect(analytics.savingsRate).toBe(60); // (100k - 40k) / 100k = 60%

    // Breakdown: Food 75%, Transport 25%
    expect(analytics.categoryBreakdown.length).toBe(2);
    expect(analytics.categoryBreakdown[0].name).toBe('Food');
    expect(analytics.categoryBreakdown[0].amountMinor).toBe(3000000);
    expect(analytics.categoryBreakdown[0].percentage).toBe(75);

    expect(analytics.categoryBreakdown[1].name).toBe('Transport');
    expect(analytics.categoryBreakdown[1].amountMinor).toBe(1000000);
    expect(analytics.categoryBreakdown[1].percentage).toBe(25);

    expect(analytics.topExpenseCategory?.name).toBe('Food');
  });

  it('handles empty month with zero expenses safely', () => {
    const scope = getMonthScope(new Date(2026, 10, 1));
    const analytics = calculateMonthAnalytics([], categories, scope);

    expect(analytics.totalIncomeMinor).toBe(0);
    expect(analytics.totalExpenseMinor).toBe(0);
    expect(analytics.netBalanceMinor).toBe(0);
    expect(analytics.categoryBreakdown.length).toBe(0);
    expect(analytics.topExpenseCategory).toBeNull();
    expect(analytics.savingsRate).toBeNull();
  });

  it('returns a negative savings rate when expenses exceed income', () => {
    const scope = getMonthScope(new Date(2026, 10, 1)); // Nov 2026
    const transactions: Transaction[] = [
      {
        id: 1,
        type: 'income',
        amountMinor: 1000000, // ₹10,000
        date: '2026-11-01',
        description: 'Paycheck',
        createdAt: 1000,
        categoryId: 3,
      },
      {
        id: 2,
        type: 'expense',
        amountMinor: 1500000, // ₹15,000
        date: '2026-11-10',
        description: 'Overspent',
        createdAt: 2000,
        categoryId: 1,
      },
    ];

    const analytics = calculateMonthAnalytics(transactions, categories, scope);

    expect(analytics.totalIncomeMinor).toBe(1000000);
    expect(analytics.totalExpenseMinor).toBe(1500000);
    expect(analytics.netBalanceMinor).toBe(-500000);
    expect(analytics.savingsRate).toBe(-50); // (10k - 15k) / 10k = -50%
  });

  it('returns a null savings rate when income is zero and expenses exist', () => {
    const scope = getMonthScope(new Date(2026, 10, 1)); // Nov 2026
    const transactions: Transaction[] = [
      {
        id: 1,
        type: 'expense',
        amountMinor: 500000, // ₹5,000
        date: '2026-11-10',
        description: 'Spend with no income',
        createdAt: 1000,
        categoryId: 1,
      },
    ];

    const analytics = calculateMonthAnalytics(transactions, categories, scope);

    expect(analytics.totalIncomeMinor).toBe(0);
    expect(analytics.totalExpenseMinor).toBe(500000);
    expect(analytics.savingsRate).toBeNull();
  });

  it('calculateMultiMonthTrends computes sequential monthly trends', () => {
    const refDate = new Date(2026, 10, 20); // Nov 2026
    const transactions: Transaction[] = [
      {
        id: 1,
        type: 'income',
        amountMinor: 500000,
        date: '2026-11-05',
        description: null,
        createdAt: 1000,
        categoryId: 3,
      },
      {
        id: 2,
        type: 'expense',
        amountMinor: 200000,
        date: '2026-11-10',
        description: null,
        createdAt: 2000,
        categoryId: 1,
      },
      {
        id: 3,
        type: 'expense',
        amountMinor: 150000,
        date: '2026-10-15',
        description: null,
        createdAt: 3000,
        categoryId: 1,
      },
    ];

    const trends = calculateMultiMonthTrends(transactions, 3, refDate);
    expect(trends.length).toBe(3);
    // Chronological order: Sep 2026, Oct 2026, Nov 2026
    expect(trends[0].month).toBe(9); // Sep
    expect(trends[0].incomeMinor).toBe(0);
    expect(trends[0].expenseMinor).toBe(0);

    expect(trends[1].month).toBe(10); // Oct
    expect(trends[1].expenseMinor).toBe(150000);

    expect(trends[2].month).toBe(11); // Nov
    expect(trends[2].incomeMinor).toBe(500000);
    expect(trends[2].expenseMinor).toBe(200000);
    expect(trends[2].netMinor).toBe(300000);
  });
});
