import { describe, expect, it } from 'bun:test';
import { formatTransactionsToCsv } from '../src/lib/csvExport';
import type { Category, Transaction } from '../src/storage';

describe('formatTransactionsToCsv', () => {
  const categories: Category[] = [
    { id: 1, type: 'expense', name: 'Food & Dining', isBuiltin: true },
    { id: 2, type: 'income', name: 'Salary', isBuiltin: true },
  ];

  it('generates standard RFC 4180 CSV with header and formatted records', () => {
    const transactions: Transaction[] = [
      {
        id: 1,
        type: 'expense',
        amountMinor: 25050, // ₹250.50
        date: '2026-11-20',
        description: 'Lunch at Cafe',
        createdAt: 1000,
        categoryId: 1,
      },
      {
        id: 2,
        type: 'income',
        amountMinor: 10000000, // ₹100,000.00
        date: '2026-11-01',
        description: null,
        createdAt: 2000,
        categoryId: 2,
      },
    ];

    const csv = formatTransactionsToCsv(transactions, categories);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe('Date,Type,Category,Amount (INR),Description');
    // Check line for income (dated Nov 1) or expense (dated Nov 20)
    expect(lines).toContain('2026-11-20,Expense,Food & Dining,250.50,Lunch at Cafe');
    expect(lines).toContain('2026-11-01,Income,Salary,100000.00,');
  });

  it('escapes fields containing commas, double quotes, and newlines', () => {
    const transactions: Transaction[] = [
      {
        id: 10,
        type: 'expense',
        amountMinor: 50000,
        date: '2026-11-22',
        description: 'Books, "Special Edition"\nPart 2',
        createdAt: 5000,
        categoryId: 1,
      },
    ];

    const csv = formatTransactionsToCsv(transactions, categories);
    expect(csv).toContain('"Books, ""Special Edition""\nPart 2"');
  });

  it('handles empty transaction list returning just header', () => {
    const csv = formatTransactionsToCsv([], categories);
    expect(csv).toBe('Date,Type,Category,Amount (INR),Description');
  });
});
