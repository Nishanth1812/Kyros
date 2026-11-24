import type { Category, MinorUnits, Transaction, TransactionType } from '../storage';

export interface MonthScope {
  year: number;
  month: number; // 1-12
  label: string;
  dateFrom: string;
  dateTo: string;
}

export interface CategorySpendingBreakdown {
  categoryId: number;
  name: string;
  type: TransactionType;
  amountMinor: MinorUnits;
  percentage: number;
}

export interface MonthlyTrendDataPoint {
  year: number;
  month: number;
  label: string;
  incomeMinor: MinorUnits;
  expenseMinor: MinorUnits;
  netMinor: MinorUnits;
}

export interface MonthAnalytics {
  scope: MonthScope;
  totalIncomeMinor: MinorUnits;
  totalExpenseMinor: MinorUnits;
  netBalanceMinor: MinorUnits;
  dailyAverageExpenseMinor: MinorUnits;
  categoryBreakdown: CategorySpendingBreakdown[];
  topExpenseCategory: CategorySpendingBreakdown | null;
  savingsRate: number;
  transactionCount: number;
}

export function getMonthScope(date: Date = new Date()): MonthScope {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthPadded = String(month).padStart(2, '0');
  const label = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return {
    year,
    month,
    label,
    dateFrom: `${year}-${monthPadded}-01`,
    dateTo: `${year}-${monthPadded}-${String(daysInMonth).padStart(2, '0')}`,
  };
}

export function shiftMonth(scope: MonthScope, offsetMonths: number): MonthScope {
  const shiftedDate = new Date(scope.year, scope.month - 1 + offsetMonths, 1);
  return getMonthScope(shiftedDate);
}

export function calculateMonthAnalytics(
  transactions: Transaction[],
  categories: Category[],
  scope: MonthScope
): MonthAnalytics {
  const categoryMap = new Map<number, Category>();
  for (const cat of categories) {
    categoryMap.set(cat.id, cat);
  }

  const monthTransactions = transactions.filter(
    (t) => t.date >= scope.dateFrom && t.date <= scope.dateTo
  );

  let totalIncomeMinor = 0;
  let totalExpenseMinor = 0;
  const categoryExpenseMap = new Map<number, number>();

  for (const tx of monthTransactions) {
    if (tx.type === 'income') {
      totalIncomeMinor += tx.amountMinor;
    } else if (tx.type === 'expense') {
      totalExpenseMinor += tx.amountMinor;
      const current = categoryExpenseMap.get(tx.categoryId) ?? 0;
      categoryExpenseMap.set(tx.categoryId, current + tx.amountMinor);
    }
  }

  const netBalanceMinor = totalIncomeMinor - totalExpenseMinor;
  const daysInMonth = parseInt(scope.dateTo.split('-')[2], 10);
  const dailyAverageExpenseMinor =
    totalExpenseMinor > 0 ? Math.round(totalExpenseMinor / daysInMonth) : 0;

  const categoryBreakdown: CategorySpendingBreakdown[] = [];
  for (const [categoryId, amountMinor] of categoryExpenseMap.entries()) {
    const cat = categoryMap.get(categoryId);
    const percentage =
      totalExpenseMinor > 0 ? Math.round((amountMinor / totalExpenseMinor) * 100) : 0;
    categoryBreakdown.push({
      categoryId,
      name: cat?.name ?? 'Other',
      type: 'expense',
      amountMinor,
      percentage,
    });
  }

  // Sort largest expense category first
  categoryBreakdown.sort((a, b) => b.amountMinor - a.amountMinor);

  const topExpenseCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

  const savingsRate =
    totalIncomeMinor > 0 && totalIncomeMinor >= totalExpenseMinor
      ? Math.round(((totalIncomeMinor - totalExpenseMinor) / totalIncomeMinor) * 100)
      : 0;

  return {
    scope,
    totalIncomeMinor,
    totalExpenseMinor,
    netBalanceMinor,
    dailyAverageExpenseMinor,
    categoryBreakdown,
    topExpenseCategory,
    savingsRate,
    transactionCount: monthTransactions.length,
  };
}

export function calculateMultiMonthTrends(
  transactions: Transaction[],
  monthsCount: number = 6,
  referenceDate: Date = new Date()
): MonthlyTrendDataPoint[] {
  const result: MonthlyTrendDataPoint[] = [];

  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    const scope = getMonthScope(d);
    const shortLabel = d.toLocaleDateString('en-US', { month: 'short' });

    let incomeMinor = 0;
    let expenseMinor = 0;

    for (const tx of transactions) {
      if (tx.date >= scope.dateFrom && tx.date <= scope.dateTo) {
        if (tx.type === 'income') {
          incomeMinor += tx.amountMinor;
        } else if (tx.type === 'expense') {
          expenseMinor += tx.amountMinor;
        }
      }
    }

    result.push({
      year: scope.year,
      month: scope.month,
      label: shortLabel,
      incomeMinor,
      expenseMinor,
      netMinor: incomeMinor - expenseMinor,
    });
  }

  return result;
}
