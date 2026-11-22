import type { Category, Transaction } from '../storage';
import { normalizeDateBounds } from './transactionFilters';

export interface CategoryExpenseTotal {
  categoryId: number;
  categoryName: string;
  amountMinor: number;
}

export interface DashboardSummary {
  /** Lifetime income minus lifetime expense, independent of the period bounds. */
  balanceMinor: number;
  periodIncomeMinor: number;
  periodExpenseMinor: number;
  /** Period expenses grouped by category, by amount descending then name ascending. */
  expenseByCategory: CategoryExpenseTotal[];
}

/** Add integer minor units, failing loudly rather than returning a rounded total. */
function checkedAdd(left: number, right: number): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    throw new RangeError('Money total exceeds the safe integer range.');
  }
  return sum;
}

export function summarizeTransactions(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  dateFrom?: string,
  dateTo?: string
): DashboardSummary {
  const bounds = normalizeDateBounds(dateFrom, dateTo);

  let balanceMinor = 0;
  let periodIncomeMinor = 0;
  let periodExpenseMinor = 0;
  const expenseByCategory = new Map<number, number>();
  const categoryNames = new Map<number, string>();
  for (const category of categories) {
    categoryNames.set(category.id, category.name);
  }

  for (const transaction of transactions) {
    // Lifetime balance covers every row; signed addition keeps it a checked integer sum.
    const signed = transaction.type === 'income'
      ? transaction.amountMinor
      : -transaction.amountMinor;
    balanceMinor = checkedAdd(balanceMinor, signed);

    const inPeriod =
      (bounds.dateFrom === undefined || transaction.date >= bounds.dateFrom) &&
      (bounds.dateTo === undefined || transaction.date <= bounds.dateTo);
    if (!inPeriod) continue;

    if (transaction.type === 'income') {
      periodIncomeMinor = checkedAdd(periodIncomeMinor, transaction.amountMinor);
      continue;
    }

    periodExpenseMinor = checkedAdd(periodExpenseMinor, transaction.amountMinor);
    const previous = expenseByCategory.get(transaction.categoryId) ?? 0;
    expenseByCategory.set(
      transaction.categoryId,
      checkedAdd(previous, transaction.amountMinor)
    );
  }

  const expenseTotals: CategoryExpenseTotal[] = [...expenseByCategory.entries()].map(
    ([categoryId, amountMinor]) => ({
      categoryId,
      categoryName: categoryNames.get(categoryId) ?? 'Uncategorized',
      amountMinor,
    })
  );
  expenseTotals.sort(
    (a, b) => b.amountMinor - a.amountMinor || a.categoryName.localeCompare(b.categoryName)
  );

  return {
    balanceMinor,
    periodIncomeMinor,
    periodExpenseMinor,
    expenseByCategory: expenseTotals,
  };
}
