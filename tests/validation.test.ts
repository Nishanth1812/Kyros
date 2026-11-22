import { describe, expect, test } from 'bun:test';
import {
  CategoryValidationError,
  MAX_AMOUNT_MINOR_UNITS,
  TransactionValidationError,
  assertValidCategoryInput,
  validateCategoryInput,
  validateTransactionInput,
} from '../src/storage';
import { createTransactionStorage } from '../src/storage';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';

describe('validateTransactionInput', () => {
  test('accepts a valid income transaction', () => {
    const result = validateTransactionInput({
      type: 'income',
      amountMinor: 1250,
      date: '2026-11-21',
      description: 'Salary',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.value).toEqual({
      type: 'income',
      amountMinor: 1250,
      date: '2026-11-21',
      description: 'Salary',
    });
  });

  test('accepts a valid expense transaction with optional description omitted', () => {
    const result = validateTransactionInput({
      type: 'expense',
      amountMinor: 500,
      date: '2026-01-01',
    });
    expect(result.ok).toBe(true);
    expect(result.value?.description).toBeNull();
  });

  test('trims description and treats blank as null', () => {
    const result = validateTransactionInput({
      type: 'expense',
      amountMinor: 500,
      date: '2026-01-01',
      description: '   ',
    });
    expect(result.ok).toBe(true);
    expect(result.value?.description).toBeNull();
  });

  test('rejects missing required fields', () => {
    const result = validateTransactionInput({});
    expect(result.ok).toBe(false);
    const fields = result.errors.map((e) => e.field).sort();
    expect(fields).toEqual(['amountMinor', 'date', 'type']);
  });

  test('rejects empty type and amount', () => {
    const result = validateTransactionInput({ type: '', amountMinor: '', date: '2026-01-01' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'type')).toBe(true);
    expect(result.errors.some((e) => e.field === 'amountMinor')).toBe(true);
  });

  test('rejects invalid type', () => {
    const result = validateTransactionInput({ type: 'transfer', amountMinor: 100, date: '2026-01-01' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ field: 'type' });
  });

  test('rejects zero amount', () => {
    const result = validateTransactionInput({ type: 'income', amountMinor: 0, date: '2026-01-01' });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      { field: 'amountMinor', message: 'Amount must be greater than zero.' },
    ]);
  });

  test('rejects negative amount', () => {
    const result = validateTransactionInput({ type: 'expense', amountMinor: -1, date: '2026-01-01' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ field: 'amountMinor' });
    expect(result.errors[0].message).toContain('negative');
  });

  test('rejects malformed amounts (float, NaN, Infinity, string)', () => {
    const cases: any[] = [12.5, NaN, Infinity, -Infinity, '100', '12.34', 'abc'];
    for (const amountMinor of cases) {
      const result = validateTransactionInput({ type: 'income', amountMinor, date: '2026-01-01' });
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.field === 'amountMinor')).toBe(true);
    }
  });

  test('rejects excessively large amounts', () => {
    const result = validateTransactionInput({
      type: 'income',
      amountMinor: MAX_AMOUNT_MINOR_UNITS + 1,
      date: '2026-01-01',
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ field: 'amountMinor' });
    expect(result.errors[0].message).toContain('excessively large');
  });

  test('accepts maximum safe integer amount', () => {
    const result = validateTransactionInput({
      type: 'income',
      amountMinor: MAX_AMOUNT_MINOR_UNITS,
      date: '2026-01-01',
    });
    expect(result.ok).toBe(true);
  });

  test('rejects invalid or malformed dates', () => {
    const cases = ['2026-13-01', '2026-02-30', '2026/01/01', '01-01-2026', 'not-a-date', 20260101];
    for (const date of cases) {
      const result = validateTransactionInput({ type: 'income', amountMinor: 100, date });
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.field === 'date')).toBe(true);
    }
  });

  test('accepts valid calendar dates with years below 0100', () => {
    for (const date of ['0000-02-29', '0099-12-31']) {
      const result = validateTransactionInput({ type: 'income', amountMinor: 100, date });
      expect(result.ok).toBe(true);
    }
  });

  test('storage refuses to save invalid amount and throws TransactionValidationError', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createTransactionStorage(db);
    try {
      await expect(
        storage.addTransaction({ type: 'income', amountMinor: -5, date: '2026-01-01' })
      ).rejects.toBeInstanceOf(TransactionValidationError);

      const rows = await db.getAllAsync<any>('SELECT * FROM transactions;');
      expect(rows.length).toBe(0);
    } finally {
      close();
    }
  });
});

describe('validateCategoryInput', () => {
  test('trims a name and rejects blank names', () => {
    expect(validateCategoryInput({ type: 'expense', name: '  Groceries  ' }).value).toEqual({
      type: 'expense',
      name: 'Groceries',
    });
    expect(validateCategoryInput({ type: 'expense', name: '' }).ok).toBe(false);
    expect(validateCategoryInput({ type: 'expense', name: '   ' }).ok).toBe(false);
  });

  test('rejects an invalid category type', () => {
    const result = validateCategoryInput({ type: 'transfer' as any, name: 'X' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ field: 'type' });
  });

  test('assertValidCategoryInput throws CategoryValidationError on invalid input', () => {
    expect(() => assertValidCategoryInput({ type: 'income', name: ' ' })).toThrow(
      CategoryValidationError
    );
  });
});
