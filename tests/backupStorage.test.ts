import { describe, expect, it } from 'bun:test';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';
import { initializeSchema } from '../src/storage/schema';
import { exportBackupData, restoreBackupData } from '../src/storage/backupStorage';
import { KyrosBackupV1 } from '../src/storage/types';
import packageJson from '../package.json';

describe('backupStorage', () => {
  it('test_export_backup_captures_all_current_data', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);

      // Add custom category
      const catRes = await db.runAsync(
        'INSERT INTO categories (type, name, is_builtin) VALUES (?, ?, ?)',
        'expense',
        'Books',
        0
      );
      const catId = catRes.lastInsertRowId;

      // Add transaction
      await db.runAsync(
        `INSERT INTO transactions (type, amount_minor, date, description, created_at, category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        'expense',
        150000,
        '2026-11-23',
        'TypeScript Book',
        1700000000000,
        catId
      );

      // Add budgets
      await db.runAsync(
        'INSERT INTO budgets (category_id, amount_minor) VALUES (?, ?)',
        null,
        10000000
      );
      await db.runAsync(
        'INSERT INTO budgets (category_id, amount_minor) VALUES (?, ?)',
        catId,
        2500000
      );

      const backup = await exportBackupData(db);

      expect(backup.meta.version).toBe(2);
      expect(backup.meta.appVersion).toBe(packageJson.version);
      expect(typeof backup.meta.exportedAt).toBe('string');

      // Built-in categories (12) + 1 custom category = 13
      expect(backup.data.categories.length).toBe(13);
      const booksCat = backup.data.categories.find((c) => c.name === 'Books');
      expect(booksCat).toBeDefined();
      expect(booksCat?.isBuiltin).toBe(false);

      expect(backup.data.transactions.length).toBe(1);
      expect(backup.data.transactions[0].description).toBe('TypeScript Book');
      expect(backup.data.transactions[0].amountMinor).toBe(150000);

      expect(backup.data.budgets.length).toBe(2);
      const overall = backup.data.budgets.find((b) => b.categoryId === null);
      expect(overall?.amountMinor).toBe(10000000);
      const catBudget = backup.data.budgets.find((b) => b.categoryId === catId);
      expect(catBudget?.amountMinor).toBe(2500000);
    } finally {
      close();
    }
  });

  it('test_restore_backup_replaces_all_tables_atomically', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);

      // Initial state
      const initialCat = await db.runAsync(
        'INSERT INTO categories (type, name, is_builtin) VALUES (?, ?, ?)',
        'income',
        'Bonus',
        0
      );
      await db.runAsync(
        `INSERT INTO transactions (type, amount_minor, date, description, created_at, category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        'income',
        500000,
        '2026-11-01',
        'Initial Bonus',
        1700000000000,
        initialCat.lastInsertRowId
      );

      const targetBackup: KyrosBackupV1 = {
        meta: {
          version: 1,
          appVersion: '0.4.0',
          exportedAt: '2026-11-23T15:00:00.000Z',
        },
        data: {
          categories: [
            { id: 101, type: 'expense', name: 'Subscriptions', isBuiltin: false },
            { id: 102, type: 'income', name: 'Investments', isBuiltin: false },
          ],
          transactions: [
            {
              id: 201,
              type: 'expense',
              amountMinor: 99900,
              date: '2026-11-15',
              description: 'Music Streaming',
              createdAt: 1700000050000,
              categoryId: 101,
            },
          ],
          budgets: [
            { id: 301, categoryId: null, amountMinor: 2000000 },
            { id: 302, categoryId: 101, amountMinor: 500000 },
          ],
        },
      };

      const result = await restoreBackupData(db, targetBackup);

      expect(result.transactionsCount).toBe(1);
      expect(result.budgetsCount).toBe(2);

      // Verify old data is gone
      const oldTx = await db.getAllAsync('SELECT * FROM transactions WHERE description = ?', 'Initial Bonus');
      expect(oldTx.length).toBe(0);

      // Verify new data is present
      const newTx = await db.getAllAsync('SELECT * FROM transactions WHERE description = ?', 'Music Streaming');
      expect(newTx.length).toBe(1);
      expect(newTx[0].amount_minor).toBe(99900);

      const budgets = await db.getAllAsync('SELECT * FROM budgets');
      expect(budgets.length).toBe(2);

      const restoredCategories = await db.getAllAsync<{ updated_at: number }>(
        'SELECT updated_at FROM categories WHERE id IN (101, 102);'
      );
      expect(restoredCategories.every((category) => category.updated_at > 0)).toBe(true);
      const restoredBudgets = await db.getAllAsync<{ updated_at: number }>(
        'SELECT updated_at FROM budgets ORDER BY id;'
      );
      expect(restoredBudgets.every((budget) => budget.updated_at > 0)).toBe(true);
    } finally {
      close();
    }
  });

  it('test_restore_backup_rolls_back_completely_on_error', async () => {
    const options: { failBeforeCommit?: Error } = {};
    const { db, close } = createBunSqliteAdapter(':memory:', options);
    try {
      await initializeSchema(db);

      // Add baseline data before attempt
      const baselineCat = await db.runAsync(
        'INSERT INTO categories (type, name, is_builtin) VALUES (?, ?, ?)',
        'expense',
        'BaselineCat',
        0
      );
      await db.runAsync(
        `INSERT INTO transactions (type, amount_minor, date, description, created_at, category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        'expense',
        4200,
        '2026-11-23',
        'Baseline Expense',
        1700000000000,
        baselineCat.lastInsertRowId
      );

      const targetBackup: KyrosBackupV1 = {
        meta: {
          version: 1,
          appVersion: '0.4.0',
          exportedAt: '2026-11-23T15:00:00.000Z',
        },
        data: {
          categories: [
            { id: 101, type: 'expense', name: 'ReplacedCat', isBuiltin: false },
          ],
          transactions: [
            {
              id: 201,
              type: 'expense',
              amountMinor: 8800,
              date: '2026-11-20',
              description: 'Replaced Expense',
              createdAt: 1700000000000,
              categoryId: 101,
            },
          ],
          budgets: [],
        },
      };

      options.failBeforeCommit = new Error('Failure during restore commit');
      await expect(restoreBackupData(db, targetBackup)).rejects.toThrow('Failure during restore commit');

      // Assert database was completely rolled back
      const transactions = await db.getAllAsync('SELECT * FROM transactions');
      expect(transactions.length).toBe(1);
      expect(transactions[0].description).toBe('Baseline Expense');
      expect(transactions[0].amount_minor).toBe(4200);

      const categories = await db.getAllAsync('SELECT * FROM categories WHERE name = ?', 'BaselineCat');
      expect(categories.length).toBe(1);

      const replacedCat = await db.getAllAsync('SELECT * FROM categories WHERE name = ?', 'ReplacedCat');
      expect(replacedCat.length).toBe(0);
    } finally {
      close();
    }
  });
});
