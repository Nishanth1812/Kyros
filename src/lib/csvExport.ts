import type { Category, Transaction } from '../storage';

function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatTransactionsToCsv(
  transactions: Transaction[],
  categories: Category[]
): string {
  const categoryMap = new Map<number, string>();
  for (const cat of categories) {
    categoryMap.set(cat.id, cat.name);
  }

  const header = ['Date', 'Type', 'Category', 'Amount (INR)', 'Description'].join(',');
  if (transactions.length === 0) {
    return header;
  }

  // Sort newest first by date, then id descending
  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id - a.id;
  });

  const rows = sorted.map((tx) => {
    const date = tx.date;
    const type = tx.type === 'income' ? 'Income' : 'Expense';
    const categoryName = categoryMap.get(tx.categoryId) ?? 'Other';
    const amount = (tx.amountMinor / 100).toFixed(2);
    const description = tx.description ?? '';

    return [
      escapeCsvField(date),
      escapeCsvField(type),
      escapeCsvField(categoryName),
      escapeCsvField(amount),
      escapeCsvField(description),
    ].join(',');
  });

  return [header, ...rows].join('\r\n');
}
