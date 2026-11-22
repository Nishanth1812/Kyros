import type { Transaction, TransactionType } from '../storage';

export interface TransactionFilters {
  type?: TransactionType;
  categoryId?: number;
  /** Inclusive ISO calendar-date lower bound (YYYY-MM-DD). */
  dateFrom?: string;
  /** Inclusive ISO calendar-date upper bound (YYYY-MM-DD). */
  dateTo?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * Validate and normalize optional inclusive date bounds. An absent (or blank)
 * bound means "unbounded". Shared with the summary helper so both features
 * reject the same malformed or reversed ranges.
 */
export function normalizeDateBounds(
  dateFrom?: string,
  dateTo?: string
): { dateFrom?: string; dateTo?: string } {
  const from = dateFrom === undefined || dateFrom === '' ? undefined : dateFrom;
  const to = dateTo === undefined || dateTo === '' ? undefined : dateTo;

  if (from !== undefined && !isValidCalendarDate(from)) {
    throw new RangeError('dateFrom must be a valid ISO calendar date (YYYY-MM-DD).');
  }
  if (to !== undefined && !isValidCalendarDate(to)) {
    throw new RangeError('dateTo must be a valid ISO calendar date (YYYY-MM-DD).');
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw new RangeError('dateFrom must not be after dateTo.');
  }
  return { dateFrom: from, dateTo: to };
}

/** Return the matching transactions without mutating the source list. */
export function filterTransactions(
  transactions: readonly Transaction[],
  filters: TransactionFilters = {}
): Transaction[] {
  const bounds = normalizeDateBounds(filters.dateFrom, filters.dateTo);
  const { type, categoryId } = filters;

  return transactions.filter((transaction) => {
    if (type !== undefined && transaction.type !== type) return false;
    if (categoryId !== undefined && transaction.categoryId !== categoryId) return false;
    if (bounds.dateFrom !== undefined && transaction.date < bounds.dateFrom) return false;
    if (bounds.dateTo !== undefined && transaction.date > bounds.dateTo) return false;
    return true;
  });
}
