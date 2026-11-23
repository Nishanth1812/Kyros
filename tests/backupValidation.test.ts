import { describe, expect, it } from 'bun:test';
import { validateBackupPayload } from '../src/storage/backupValidation';
import { BackupValidationError } from '../src/storage/types';

describe('validateBackupPayload', () => {
  const validPayload = {
    meta: {
      version: 1,
      appVersion: '0.4.0',
      exportedAt: '2026-11-23T12:00:00.000Z',
    },
    data: {
      categories: [
        { id: 1, type: 'expense', name: 'Food', isBuiltin: true },
        { id: 2, type: 'income', name: 'Salary', isBuiltin: true },
        { id: 3, type: 'expense', name: 'Coffee', isBuiltin: false },
      ],
      transactions: [
        {
          id: 10,
          type: 'expense',
          amountMinor: 25000,
          date: '2026-11-20',
          description: 'Lunch',
          createdAt: 1700000000000,
          categoryId: 1,
        },
        {
          id: 11,
          type: 'income',
          amountMinor: 5000000,
          date: '2026-11-01',
          description: null,
          createdAt: 1700000000100,
          categoryId: 2,
        },
      ],
      budgets: [
        { id: 100, categoryId: null, amountMinor: 5000000 },
        { id: 101, categoryId: 1, amountMinor: 1000000 },
      ],
    },
  };

  it('accepts a valid KyrosBackupV1 payload', () => {
    const validated = validateBackupPayload(validPayload);
    expect(validated.meta.version).toBe(1);
    expect(validated.data.categories.length).toBe(3);
    expect(validated.data.transactions.length).toBe(2);
    expect(validated.data.budgets.length).toBe(2);
  });

  it('accepts valid payload when parsed from JSON string', () => {
    const jsonStr = JSON.stringify(validPayload);
    const validated = validateBackupPayload(jsonStr);
    expect(validated.meta.version).toBe(1);
  });

  it('rejects non-object or malformed JSON payloads', () => {
    expect(() => validateBackupPayload(null)).toThrow(BackupValidationError);
    expect(() => validateBackupPayload('not json')).toThrow(BackupValidationError);
    expect(() => validateBackupPayload(123)).toThrow(BackupValidationError);
    expect(() => validateBackupPayload([])).toThrow(BackupValidationError);
  });

  it('rejects unsupported or missing schema version', () => {
    const badVersion = { ...validPayload, meta: { ...validPayload.meta, version: 2 } };
    expect(() => validateBackupPayload(badVersion)).toThrow('Unsupported backup version');

    const missingMeta = { data: validPayload.data };
    expect(() => validateBackupPayload(missingMeta)).toThrow('Missing backup metadata');
  });

  it('rejects missing or malformed data sections', () => {
    const noData = { meta: validPayload.meta };
    expect(() => validateBackupPayload(noData)).toThrow('Missing backup data');

    const invalidCats = {
      ...validPayload,
      data: { ...validPayload.data, categories: 'not-an-array' },
    };
    expect(() => validateBackupPayload(invalidCats)).toThrow('categories must be an array');
  });

  it('rejects invalid categories in backup', () => {
    const invalidType = {
      ...validPayload,
      data: {
        ...validPayload.data,
        categories: [{ id: 1, type: 'invalid', name: 'Test', isBuiltin: false }],
      },
    };
    expect(() => validateBackupPayload(invalidType)).toThrow('category type');

    const blankName = {
      ...validPayload,
      data: {
        ...validPayload.data,
        categories: [{ id: 1, type: 'expense', name: '  ', isBuiltin: false }],
      },
    };
    expect(() => validateBackupPayload(blankName)).toThrow('category name');
  });

  it('rejects invalid transactions in backup', () => {
    const badAmount = {
      ...validPayload,
      data: {
        ...validPayload.data,
        transactions: [
          {
            id: 1,
            type: 'expense',
            amountMinor: -100,
            date: '2026-11-20',
            description: null,
            createdAt: 1000,
            categoryId: 1,
          },
        ],
      },
    };
    expect(() => validateBackupPayload(badAmount)).toThrow('amountMinor');

    const badDate = {
      ...validPayload,
      data: {
        ...validPayload.data,
        transactions: [
          {
            id: 1,
            type: 'expense',
            amountMinor: 100,
            date: '20-11-2026',
            description: null,
            createdAt: 1000,
            categoryId: 1,
          },
        ],
      },
    };
    expect(() => validateBackupPayload(badDate)).toThrow('ISO 8601');
  });

  it('rejects transactions referencing missing categories or mismatched types', () => {
    const missingCat = {
      ...validPayload,
      data: {
        ...validPayload.data,
        transactions: [
          {
            id: 1,
            type: 'expense',
            amountMinor: 100,
            date: '2026-11-20',
            description: null,
            createdAt: 1000,
            categoryId: 999, // not in categories array
          },
        ],
      },
    };
    expect(() => validateBackupPayload(missingCat)).toThrow('references missing category');

    const mismatchedType = {
      ...validPayload,
      data: {
        ...validPayload.data,
        transactions: [
          {
            id: 1,
            type: 'expense', // transaction is expense
            amountMinor: 100,
            date: '2026-11-20',
            description: null,
            createdAt: 1000,
            categoryId: 2, // category 2 is income
          },
        ],
      },
    };
    expect(() => validateBackupPayload(mismatchedType)).toThrow('does not match category type');
  });

  it('rejects invalid budgets in backup', () => {
    const badBudgetAmount = {
      ...validPayload,
      data: {
        ...validPayload.data,
        budgets: [{ id: 1, categoryId: null, amountMinor: 0 }],
      },
    };
    expect(() => validateBackupPayload(badBudgetAmount)).toThrow('amountMinor');

    const duplicateOverall = {
      ...validPayload,
      data: {
        ...validPayload.data,
        budgets: [
          { id: 1, categoryId: null, amountMinor: 1000 },
          { id: 2, categoryId: null, amountMinor: 2000 },
        ],
      },
    };
    expect(() => validateBackupPayload(duplicateOverall)).toThrow('Duplicate overall budget');

    const duplicateCategoryBudget = {
      ...validPayload,
      data: {
        ...validPayload.data,
        budgets: [
          { id: 1, categoryId: 1, amountMinor: 1000 },
          { id: 2, categoryId: 1, amountMinor: 2000 },
        ],
      },
    };
    expect(() => validateBackupPayload(duplicateCategoryBudget)).toThrow('Duplicate budget for category');

    const incomeBudget = {
      ...validPayload,
      data: {
        ...validPayload.data,
        budgets: [{ id: 1, categoryId: 2, amountMinor: 1000 }], // category 2 is income
      },
    };
    expect(() => validateBackupPayload(incomeBudget)).toThrow('income category');
  });
});
