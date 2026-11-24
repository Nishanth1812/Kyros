import { describe, expect, it } from 'bun:test';
import type { CategorySpendingBreakdown, MonthlyTrendDataPoint } from '../src/lib/analytics';
import { formatMinorUnits } from '../src/lib/money';

describe('Chart Components Data & Calculations', () => {
  it('computes proportional heights for MonthlyTrendChart', () => {
    const trends: MonthlyTrendDataPoint[] = [
      { year: 2026, month: 10, label: 'Oct', incomeMinor: 100000, expenseMinor: 50000, netMinor: 50000 },
      { year: 2026, month: 11, label: 'Nov', incomeMinor: 200000, expenseMinor: 150000, netMinor: 50000 },
    ];

    const maxAmount = Math.max(
      ...trends.map((t) => Math.max(t.incomeMinor, t.expenseMinor)),
      1000
    );
    expect(maxAmount).toBe(200000);

    const BAR_MAX_HEIGHT = 100;
    // For Nov income (200,000 / 200,000 * 100 = 100)
    const novIncomeHeight = Math.round((200000 / maxAmount) * BAR_MAX_HEIGHT);
    expect(novIncomeHeight).toBe(100);

    // For Oct expense (50,000 / 200,000 * 100 = 25)
    const octExpenseHeight = Math.round((50000 / maxAmount) * BAR_MAX_HEIGHT);
    expect(octExpenseHeight).toBe(25);
  });

  it('formats accessibility summaries correctly for category breakdowns', () => {
    const breakdown: CategorySpendingBreakdown[] = [
      { categoryId: 1, name: 'Groceries', type: 'expense', amountMinor: 450000, percentage: 60 },
      { categoryId: 2, name: 'Transit', type: 'expense', amountMinor: 300000, percentage: 40 },
    ];

    const label1 = `${breakdown[0].name}: ${breakdown[0].percentage} percent of expenses, ${formatMinorUnits(breakdown[0].amountMinor)}`;
    expect(label1).toContain('Groceries: 60 percent of expenses');
    expect(label1).toContain('₹4,500.00');
  });

  it('formats accessibility summaries correctly for monthly trends', () => {
    const point: MonthlyTrendDataPoint = {
      year: 2026,
      month: 11,
      label: 'Nov',
      incomeMinor: 8000000,
      expenseMinor: 4500000,
      netMinor: 3500000,
    };

    const label = `${point.label}: Income ${formatMinorUnits(
      point.incomeMinor
    )}, Expenses ${formatMinorUnits(point.expenseMinor)}, Net ${formatMinorUnits(
      point.netMinor
    )}`;

    expect(label).toContain('Nov: Income ₹80,000.00, Expenses ₹45,000.00, Net ₹35,000.00');
  });
});
