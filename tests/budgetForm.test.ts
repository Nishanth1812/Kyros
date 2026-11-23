import { describe, expect, test } from 'bun:test';

import { validateBudgetForm } from '../src/lib/budgetForm';
import type { Category } from '../src/storage/types';

const expenseCategories: Category[] = [
  { id: 1, name: 'Food', type: 'expense', isBuiltin: false },
];
const incomeCategories: Category[] = [
  { id: 2, name: 'Salary', type: 'income', isBuiltin: false },
];

describe('validateBudgetForm', () => {
  test('accepts an overall monthly limit in paise', () => {
    expect(validateBudgetForm('125.50', null, expenseCategories)).toEqual({
      ok: true,
      input: { categoryId: null, amountMinor: 12550 },
    });
  });

  test('accepts a limit for an expense category', () => {
    expect(validateBudgetForm('80', 1, expenseCategories)).toEqual({
      ok: true,
      input: { categoryId: 1, amountMinor: 8000 },
    });
  });

  test('rejects invalid amounts without producing an input', () => {
    expect(validateBudgetForm('0', null, expenseCategories)).toEqual({
      ok: false,
      field: 'amountMinor',
      message: 'Amount must be greater than zero.',
    });
  });

  test('rejects unknown category scopes', () => {
    expect(validateBudgetForm('80', 9, expenseCategories)).toEqual({
      ok: false,
      field: 'form',
      message: 'Choose an expense category.',
    });
  });

  test('rejects income category scopes', () => {
    expect(validateBudgetForm('80', 2, incomeCategories)).toEqual({
      ok: false,
      field: 'form',
      message: 'Choose an expense category.',
    });
  });
});
