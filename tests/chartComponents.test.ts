import { describe, expect, it, mock } from 'bun:test';
import type { CategorySpendingBreakdown, MonthlyTrendDataPoint } from '../src/lib/analytics';
import { formatMinorUnits } from '../src/lib/money';

// The custom charts are React Native components, whose package entry point Bun
// cannot parse. Stub only the UI layer so the pure presentation helpers that
// ship alongside them can be exercised directly, without adding a chart or
// test-rendering dependency to the app.
mock.module('react-native', () => ({
  Pressable: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: () => null,
  View: () => null,
}));
mock.module('../src/theme/ThemeContext', () => ({
  useTheme: () => ({ colors: {} }),
  useThemedStyles: (create: (colors: unknown) => unknown) => create({}),
}));

const trendChart = await import('../src/components/MonthlyTrendChart');
const categoryChart = await import('../src/components/CategoryBreakdownChart');

const point = (
  label: string,
  incomeMinor: number,
  expenseMinor: number
): MonthlyTrendDataPoint => ({
  year: 2026,
  month: 1,
  label,
  incomeMinor,
  expenseMinor,
  netMinor: incomeMinor - expenseMinor,
});

describe('Chart Components Data & Calculations', () => {
  it('computes proportional heights against the readable trend scale', () => {
    const trends = [point('Oct', 100000, 50000), point('Nov', 200000, 150000)];
    const scale = trendChart.getTrendScale(trends);

    expect(scale.isEmpty).toBe(false);
    expect(scale.maxMinor).toBe(200000);
    expect(trendChart.getBarHeight(200000, scale)).toBe(100);
    expect(trendChart.getBarHeight(50000, scale)).toBe(25);
  });

  it('formats accessibility summaries correctly for category breakdowns', () => {
    const item: CategorySpendingBreakdown = {
      categoryId: 1,
      name: 'Groceries',
      type: 'expense',
      amountMinor: 450000,
      percentage: 60,
    };

    expect(categoryChart.formatCategoryAccessibilityLabel(item)).toBe(
      'Groceries: 60 percent of expenses, ₹4,500.00'
    );
  });

  it('formats accessibility summaries correctly for monthly trends', () => {
    const november = point('Nov', 8000000, 4500000);

    expect(trendChart.formatTrendAccessibilityLabel(november)).toBe(
      'Nov: Income ₹80,000.00, Expenses ₹45,000.00, Net ₹35,000.00'
    );
  });

  it('shows an explicit empty scale for a zero-value series', () => {
    const zeroSeries = [point('May', 0, 0), point('Jun', 0, 0)];
    const scale = trendChart.getTrendScale(zeroSeries);

    expect(scale.isEmpty).toBe(true);
    expect(scale.maxMinor).toBe(0);
    expect(scale.label).toBe('No income or expenses in the last 6 months');
    expect(trendChart.getBarHeight(0, scale)).toBe(0);
  });

  it('does not inflate subpixel amounts against a large scale', () => {
    const scale = trendChart.getTrendScale([point('Jan', 10000000, 5000000)]);

    expect(scale.isEmpty).toBe(false);
    expect(scale.maxMinor).toBe(10000000);
    expect(scale.label).toBe('Scale: ₹0.00 – ₹1,00,000.00');
    expect(trendChart.getBarHeight(1, scale)).toBe(0);
    expect(trendChart.getBarHeight(100000, scale)).toBe(1);
    expect(trendChart.getBarHeight(500000, scale)).toBe(5);
  });

  it('rounds large amounts up to a readable scale ceiling', () => {
    const scale = trendChart.getTrendScale([point('Nov', 8000000, 4500000)]);

    expect(scale.maxMinor).toBe(10000000);
    expect(scale.label).toBe('Scale: ₹0.00 – ₹1,00,000.00');
    expect(trendChart.getBarHeight(8000000, scale)).toBe(80);
  });

  it('formats exact small and large values in chart labels', () => {
    expect(trendChart.formatTrendAccessibilityLabel(point('Jan', 101, 99))).toBe(
      'Jan: Income ₹1.01, Expenses ₹0.99, Net ₹0.02'
    );

    const tinyCategory: CategorySpendingBreakdown = {
      categoryId: 9,
      name: 'Miscellaneous household supplies',
      type: 'expense',
      amountMinor: 1,
      percentage: 1,
    };
    expect(categoryChart.formatCategoryAccessibilityLabel(tinyCategory)).toBe(
      'Miscellaneous household supplies: 1 percent of expenses, ₹0.01'
    );
  });

  it('keeps the segmented chart summary concise', () => {
    const breakdown: CategorySpendingBreakdown[] = [
      { categoryId: 1, name: 'Groceries', type: 'expense', amountMinor: 450000, percentage: 60 },
      { categoryId: 2, name: 'Transit', type: 'expense', amountMinor: 300000, percentage: 40 },
    ];

    expect(categoryChart.formatBreakdownSummaryLabel(breakdown)).toBe(
      'Spending distribution across 2 categories. Exact amounts are listed below.'
    );
    expect(formatMinorUnits(450000 + 300000)).toBe('₹7,500.00');
  });
});
