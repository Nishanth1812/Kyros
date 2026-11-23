import { describe, expect, test } from 'bun:test';

import {
  BudgetValidationError,
  createBudgetStorage,
  createTransactionStorage,
  type SQLiteDatabaseLike,
} from '../src/storage';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';

async function setup(): Promise<{
  db: SQLiteDatabaseLike;
  budgets: ReturnType<typeof createBudgetStorage>;
  close: () => void;
}> {
  const { db, close } = createBunSqliteAdapter(':memory:');
  const budgets = createBudgetStorage(db);
  await budgets.initialize();
  return { db, budgets, close };
}

async function expenseCategoryIds(db: SQLiteDatabaseLike): Promise<{
  food: number;
  transport: number;
  income: number;
}> {
  const food = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM categories WHERE type = 'expense' AND name = 'Food';"
  );
  const transport = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM categories WHERE type = 'expense' AND name = 'Transport';"
  );
  const income = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM categories WHERE type = 'income' AND name = 'Salary';"
  );
  if (!food || !transport || !income) {
    throw new Error('Built-in categories were not seeded.');
  }
  return { food: food.id, transport: transport.id, income: income.id };
}

describe('budget storage', () => {
  test('test_budget_storage_upserts_overall_and_category_scopes', async () => {
    const { db, budgets, close } = await setup();
    try {
      const { food, transport } = await expenseCategoryIds(db);

      const overall = await budgets.saveBudget({ amountMinor: 500000 });
      expect(overall.categoryId).toBeNull();
      expect(overall.amountMinor).toBe(500000);

      const updatedOverall = await budgets.saveBudget({ amountMinor: 600000 });
      expect(updatedOverall.id).toBe(overall.id);
      expect(updatedOverall.amountMinor).toBe(600000);

      const foodBudget = await budgets.saveBudget({
        categoryId: food,
        amountMinor: 100000,
      });
      expect(foodBudget.categoryId).toBe(food);
      expect(foodBudget.amountMinor).toBe(100000);

      const updatedFood = await budgets.saveBudget({
        categoryId: food,
        amountMinor: 150000,
      });
      expect(updatedFood.id).toBe(foodBudget.id);
      expect(updatedFood.amountMinor).toBe(150000);

      const transportBudget = await budgets.saveBudget({
        categoryId: transport,
        amountMinor: 25000,
      });
      expect(transportBudget.categoryId).toBe(transport);

      const list = await budgets.listBudgets();
      expect(list).toHaveLength(3);
      expect(list.map((budget) => budget.categoryId)).toEqual([
        null,
        food,
        transport,
      ]);
      expect(list.map((budget) => budget.amountMinor)).toEqual([
        600000,
        150000,
        25000,
      ]);

      const again = await budgets.listBudgets();
      expect(again).toEqual(list);
    } finally {
      close();
    }
  });

  test('test_budget_storage_rejects_invalid_amounts_and_income_categories', async () => {
    const { db, budgets, close } = await setup();
    try {
      const { food, income } = await expenseCategoryIds(db);

      await budgets.saveBudget({ amountMinor: 500000 });
      await budgets.saveBudget({ categoryId: food, amountMinor: 100000 });
      const savedBefore = await budgets.listBudgets();

      const invalidAmounts: unknown[] = [
        0,
        -1,
        1.5,
        '100',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
        undefined,
        null,
      ];

      for (const amountMinor of invalidAmounts) {
        await expect(
          budgets.saveBudget({ amountMinor })
        ).rejects.toBeInstanceOf(BudgetValidationError);
      }

      const invalidCategoryIds: unknown[] = [0, -1, 1.5, '1', 999999];
      for (const categoryId of invalidCategoryIds) {
        await expect(
          budgets.saveBudget({ categoryId, amountMinor: 1000 })
        ).rejects.toBeInstanceOf(BudgetValidationError);
      }

      await expect(
        budgets.saveBudget({ categoryId: income, amountMinor: 1000 })
      ).rejects.toBeInstanceOf(BudgetValidationError);

      expect(await budgets.listBudgets()).toEqual(savedBefore);
    } finally {
      close();
    }
  });

  test('test_database_prevents_duplicate_overall_and_category_budgets', async () => {
    const { db, budgets, close } = await setup();
    try {
      const { food } = await expenseCategoryIds(db);

      await db.runAsync(
        'INSERT INTO budgets (category_id, amount_minor) VALUES (NULL, 1000);'
      );
      await expect(
        db.runAsync('INSERT INTO budgets (category_id, amount_minor) VALUES (NULL, 2000);')
      ).rejects.toThrow();

      await db.runAsync(
        'INSERT INTO budgets (category_id, amount_minor) VALUES (?, 3000);',
        food
      );
      await expect(
        db.runAsync(
          'INSERT INTO budgets (category_id, amount_minor) VALUES (?, 4000);',
          food
        )
      ).rejects.toThrow();

      for (const amount of [0, -5, 12.5]) {
        await expect(
          db.runAsync(
            'INSERT INTO budgets (category_id, amount_minor) VALUES (NULL, ?);',
            amount
          )
        ).rejects.toThrow();
      }

      await expect(
        db.runAsync(
          'INSERT INTO budgets (category_id, amount_minor) VALUES (999999, 1000);'
        )
      ).rejects.toThrow();
      await expect(
        db.runAsync('INSERT INTO budgets (category_id, amount_minor) VALUES (0, 1000);')
      ).rejects.toThrow();

      const rows = await budgets.listBudgets();
      expect(rows).toHaveLength(2);
      expect(rows.map((budget) => budget.amountMinor)).toEqual([1000, 3000]);
    } finally {
      close();
    }
  });

  test('test_budget_storage_delete_leaves_transactions_and_categories_unchanged', async () => {
    const { db, budgets, close } = await setup();
    try {
      const { food } = await expenseCategoryIds(db);
      const transactionStorage = createTransactionStorage(db);
      await transactionStorage.initialize();

      await transactionStorage.addTransaction({
        type: 'expense',
        amountMinor: 1234,
        date: '2026-11-01',
        description: 'Lunch',
        categoryId: food,
      });

      const readCategories = () =>
        db.getAllAsync<Record<string, unknown>>(
          'SELECT id, type, name, is_builtin FROM categories ORDER BY id;'
        );
      const readTransactions = () =>
        db.getAllAsync<Record<string, unknown>>(
          'SELECT id, type, amount_minor, date, description, created_at, category_id FROM transactions ORDER BY id;'
        );

      const categoriesBefore = await readCategories();
      const transactionsBefore = await readTransactions();

      const budget = await budgets.saveBudget({
        categoryId: food,
        amountMinor: 50000,
      });
      await budgets.deleteBudget(budget.id);

      expect(await budgets.listBudgets()).toEqual([]);

      await budgets.deleteBudget(999999);
      await budgets.deleteBudget(-1);

      expect(await readCategories()).toEqual(categoriesBefore);
      expect(await readTransactions()).toEqual(transactionsBefore);
    } finally {
      close();
    }
  });
});
