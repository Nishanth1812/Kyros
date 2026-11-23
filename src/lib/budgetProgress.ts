import type { Budget, Transaction } from '../storage';
import { normalizeDateBounds } from './transactionFilters';

export interface BudgetProgress {
  id: number;
  categoryId: number | null;
  budgetMinor: number;
  spentMinor: number;
  /** Budget minus spending; a negative value is the exact overspend in paise. */
  remainingMinor: number;
}

/** Add integer minor units, failing loudly rather than returning a rounded total. */
function checkedAdd(left: number, right: number): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    throw new RangeError('Money total exceeds the safe integer range.');
  }
  return sum;
}

/**
 * Derive current-period spending for each saved budget from expense
 * transactions only. Nothing is persisted: limits come from saved budgets and
 * actuals come from the same stored history the dashboard and History use.
 */
export function calculateBudgetProgress(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  dateFrom: string,
  dateTo: string
): BudgetProgress[] {
  const bounds = normalizeDateBounds(dateFrom, dateTo);

  let overallSpentMinor = 0;
  const spentByCategory = new Map<number, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const inPeriod =
      (bounds.dateFrom === undefined || transaction.date >= bounds.dateFrom) &&
      (bounds.dateTo === undefined || transaction.date <= bounds.dateTo);
    if (!inPeriod) continue;

    overallSpentMinor = checkedAdd(overallSpentMinor, transaction.amountMinor);
    const previous = spentByCategory.get(transaction.categoryId) ?? 0;
    spentByCategory.set(
      transaction.categoryId,
      checkedAdd(previous, transaction.amountMinor)
    );
  }

  return budgets.map((budget) => {
    const spentMinor =
      budget.categoryId === null
        ? overallSpentMinor
        : (spentByCategory.get(budget.categoryId) ?? 0);
    return {
      id: budget.id,
      categoryId: budget.categoryId,
      budgetMinor: budget.amountMinor,
      spentMinor,
      // Both operands are safe integers, so the difference stays safe too.
      remainingMinor: budget.amountMinor - spentMinor,
    };
  });
}
