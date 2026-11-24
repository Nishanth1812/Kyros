import type { RecurringFrequency, RecurringTransaction } from '../storage/types';

/**
 * Calculates the next due date based on current due date and frequency,
 * with accurate month-end day pinning and leap-year clamping.
 */
export function calculateNextDueDate(currentDueDate: string, frequency: RecurringFrequency): string {
  const parts = currentDueDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid date format for nextDueDate: ${currentDueDate}`);
  }

  const [year, month, day] = parts; // month is 1-indexed

  if (frequency === 'daily') {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().split('T')[0];
  }

  if (frequency === 'weekly') {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().split('T')[0];
  }

  if (frequency === 'monthly') {
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    // Days in target month: Date.UTC(year, monthIndex + 1, 0)
    const daysInTargetMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    const clampedDay = Math.min(day, daysInTargetMonth);

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${nextYear}-${pad(nextMonth)}-${pad(clampedDay)}`;
  }

  if (frequency === 'yearly') {
    const nextYear = year + 1;
    let nextDay = day;
    if (month === 2 && day === 29) {
      const isLeap = (nextYear % 4 === 0 && nextYear % 100 !== 0) || nextYear % 400 === 0;
      if (!isLeap) nextDay = 28;
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${nextYear}-${pad(month)}-${pad(nextDay)}`;
  }

  throw new Error(`Unsupported recurring frequency: ${frequency}`);
}

/**
 * Filters active recurring transactions that are due on or before asOfDate.
 */
export function findDueRecurringTransactions(
  schedules: RecurringTransaction[],
  asOfDate: string
): RecurringTransaction[] {
  return schedules.filter((s) => s.isActive && s.nextDueDate <= asOfDate);
}

/**
 * Human-readable display label for frequency.
 */
export function formatFrequency(freq: RecurringFrequency): string {
  switch (freq) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    default:
      return freq;
  }
}
