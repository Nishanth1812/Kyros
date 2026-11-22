import { describe, expect, test } from 'bun:test';
import { CategoryValidationError, createCategoryStorage } from '../src/storage';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';

function setup() {
  const { db, close } = createBunSqliteAdapter(':memory:');
  return { storage: createCategoryStorage(db), db, close };
}

describe('category storage', () => {
  test('test_category_names_are_trimmed_and_unique_per_type', async () => {
    const { storage, close } = setup();
    try {
      // Blank names are rejected.
      await expect(
        storage.createCategory({ type: 'expense', name: '' })
      ).rejects.toBeInstanceOf(CategoryValidationError);
      await expect(
        storage.createCategory({ type: 'expense', name: '   ' })
      ).rejects.toBeInstanceOf(CategoryValidationError);

      // Surrounding whitespace is trimmed.
      const trimmed = await storage.createCategory({
        type: 'expense',
        name: '  Groceries  ',
      });
      expect(trimmed.name).toBe('Groceries');
      expect(trimmed.type).toBe('expense');
      expect(trimmed.isBuiltin).toBe(false);
      expect(trimmed.id).toBeGreaterThan(0);

      // Names differing only by case conflict within one transaction type.
      await expect(
        storage.createCategory({ type: 'expense', name: 'groceries' })
      ).rejects.toBeInstanceOf(CategoryValidationError);
      await expect(
        storage.createCategory({ type: 'expense', name: 'GROCERIES' })
      ).rejects.toBeInstanceOf(CategoryValidationError);

      // The same name is allowed for income and expense.
      const income = await storage.createCategory({
        type: 'income',
        name: 'Groceries',
      });
      expect(income.type).toBe('income');
      expect(income.name).toBe('Groceries');

      // A name with an apostrophe round-trips as literal text (parameterized SQL).
      const apostrophe = await storage.createCategory({
        type: 'expense',
        name: "O'Brien",
      });
      expect(apostrophe.name).toBe("O'Brien");
      const expenseList = await storage.listCategories('expense');
      expect(expenseList.some((category) => category.name === "O'Brien")).toBe(true);
    } finally {
      close();
    }
  });

  test('lists categories with built-ins first and names ascending ignoring case', async () => {
    const { storage, close } = setup();
    try {
      await storage.createCategory({ type: 'expense', name: 'zebra' });
      await storage.createCategory({ type: 'expense', name: 'Apple' });
      await storage.createCategory({ type: 'expense', name: 'banana' });

      const expense = await storage.listCategories('expense');
      expect(expense.filter((c) => c.isBuiltin).map((c) => c.name)).toEqual([
        'Bills',
        'Entertainment',
        'Food',
        'Health',
        'Home',
        'Other',
        'Shopping',
        'Transport',
      ]);
      expect(expense.filter((c) => !c.isBuiltin).map((c) => c.name)).toEqual([
        'Apple',
        'banana',
        'zebra',
      ]);

      const all = await storage.listCategories();
      const firstCustom = all.findIndex((c) => !c.isBuiltin);
      expect(firstCustom).toBeGreaterThan(0);
      expect(all.slice(0, firstCustom).every((c) => c.isBuiltin)).toBe(true);
      expect(all.slice(firstCustom).every((c) => !c.isBuiltin)).toBe(true);
      expect(all.some((c) => c.type === 'income' && c.name === 'Salary')).toBe(true);
    } finally {
      close();
    }
  });

  test('SQLite enforces case-insensitive uniqueness per type', async () => {
    const { storage, db, close } = setup();
    try {
      await storage.initialize();
      // Raw insert bypassing application validation: 'Food' is a built-in expense.
      await expect(
        db.runAsync(
          `INSERT INTO categories (type, name, is_builtin) VALUES ('expense', 'food', 0);`
        )
      ).rejects.toThrow();
      // The same name is still free for the other type.
      await expect(
        db.runAsync(
          `INSERT INTO categories (type, name, is_builtin) VALUES ('income', 'Food', 0);`
        )
      ).resolves.toBeDefined();
    } finally {
      close();
    }
  });
});
