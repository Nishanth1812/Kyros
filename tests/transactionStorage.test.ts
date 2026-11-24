import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SCHEMA_VERSION,
  TransactionValidationError,
  createTransactionStorage,
  type SQLiteDatabaseLike,
  type TransactionType,
} from '../src/storage';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';

const tempDirs: string[] = [];

function makeTempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'kyros-storage-'));
  tempDirs.push(dir);
  return join(dir, 'kyros.sqlite');
}

async function builtinCategoryId(
  db: SQLiteDatabaseLike,
  type: TransactionType,
  name: string
): Promise<number> {
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM categories WHERE type = ? AND name = ?;',
    type,
    name
  );
  if (!row) throw new Error(`Missing category ${type}/${name}`);
  return row.id;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe('transaction storage', () => {
  test('retries initialization after a transient failure', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const original = db.withTransactionAsync!;
    let attempts = 0;
    db.withTransactionAsync = async (task) => {
      if (++attempts === 1) throw new Error('temporary failure');
      return original(task);
    };
    try {
      const storage = createTransactionStorage(db);
      await expect(storage.initialize()).rejects.toThrow('temporary failure');
      await storage.initialize();
      expect(attempts).toBe(2);
    } finally {
      close();
    }
  });

  test('adds and retrieves income and expense transactions', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createTransactionStorage(db);
    try {
      await storage.initialize();
      const salaryId = await builtinCategoryId(db, 'income', 'Salary');
      const foodId = await builtinCategoryId(db, 'expense', 'Food');

      const income = await storage.addTransaction({
        type: 'income',
        amountMinor: 10000,
        date: '2026-11-20',
        description: 'Paycheck',
        categoryId: salaryId,
      });
      const expense = await storage.addTransaction({
        type: 'expense',
        amountMinor: 2599,
        date: '2026-11-21',
        description: 'Groceries',
        categoryId: foodId,
      });

      expect(income.id).toBeGreaterThan(0);
      expect(income.type).toBe('income');
      expect(income.amountMinor).toBe(10000);
      expect(income.date).toBe('2026-11-20');
      expect(income.description).toBe('Paycheck');
      expect(income.categoryId).toBe(salaryId);
      expect(typeof income.createdAt).toBe('number');

      expect(expense.type).toBe('expense');
      expect(expense.amountMinor).toBe(2599);
      expect(expense.categoryId).toBe(foodId);

      const fetched = await storage.getTransactionById(income.id);
      expect(fetched).toEqual(income);

      const missing = await storage.getTransactionById(999999);
      expect(missing).toBeNull();
    } finally {
      close();
    }
  });

  test('lists transactions newest first by date, with stable tiebreakers', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createTransactionStorage(db);
    try {
      // Control created_at for deterministic ordering on same date.
      await storage.initialize();
      await db.runAsync(
        `INSERT INTO transactions (type, amount_minor, date, description, created_at, category_id) VALUES
         ('income', 100, '2026-11-19', 'older', 1000,
           (SELECT id FROM categories WHERE type = 'income' AND name = 'Other')),
         ('expense', 200, '2026-11-21', 'newest-date', 1000,
           (SELECT id FROM categories WHERE type = 'expense' AND name = 'Other')),
         ('expense', 300, '2026-11-20', 'middle-a', 1000,
           (SELECT id FROM categories WHERE type = 'expense' AND name = 'Other')),
         ('income', 400, '2026-11-20', 'middle-b-later-created', 2000,
           (SELECT id FROM categories WHERE type = 'income' AND name = 'Other'));`
      );

      const list = await storage.listTransactions();
      expect(list.map((t) => t.description)).toEqual([
        'newest-date',
        'middle-b-later-created',
        'middle-a',
        'older',
      ]);
      expect(list.map((t) => t.amountMinor)).toEqual([200, 400, 300, 100]);
    } finally {
      close();
    }
  });

  test('persists data across reopen and repeated initialization (restart/upgrade-safe)', async () => {
    const dbPath = makeTempDbPath();

    const first = createBunSqliteAdapter(dbPath);
    try {
      const storage1 = createTransactionStorage(first.db);
      await storage1.initialize();
      await storage1.initialize(); // idempotent
      const categoryId = await builtinCategoryId(first.db, 'income', 'Salary');
      await storage1.addTransaction({
        type: 'income',
        amountMinor: 7777,
        date: '2026-11-21',
        description: 'Persist me',
        categoryId,
      });
    } finally {
      first.close();
    }

    const second = createBunSqliteAdapter(dbPath);
    try {
      const storage2 = createTransactionStorage(second.db);
      const list = await storage2.listTransactions();
      expect(list.length).toBe(1);
      expect(list[0]).toMatchObject({
        type: 'income',
        amountMinor: 7777,
        date: '2026-11-21',
        description: 'Persist me',
      });

      const version = await second.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(SCHEMA_VERSION);
    } finally {
      second.close();
    }
  });

  test('test_update_transaction_validates_category_and_preserves_identity', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createTransactionStorage(db);
    try {
      await storage.initialize();
      const foodId = await builtinCategoryId(db, 'expense', 'Food');
      const salaryId = await builtinCategoryId(db, 'income', 'Salary');

      const original = await storage.addTransaction({
        type: 'expense',
        amountMinor: 1000,
        date: '2026-11-20',
        description: 'Original',
        categoryId: foodId,
      });

      const updated = await storage.updateTransaction(original.id, {
        type: 'expense',
        amountMinor: 2000,
        date: '2026-11-21',
        description: 'Edited',
        categoryId: foodId,
      });
      expect(updated.id).toBe(original.id);
      expect(updated.createdAt).toBe(original.createdAt);
      expect(updated.amountMinor).toBe(2000);
      expect(updated.date).toBe('2026-11-21');
      expect(updated.description).toBe('Edited');
      expect(updated.categoryId).toBe(foodId);
      expect(await storage.getTransactionById(original.id)).toEqual(updated);

      // A category that does not exist rejects the update.
      await expect(
        storage.updateTransaction(original.id, {
          type: 'expense',
          amountMinor: 9999,
          date: '2026-11-22',
          description: 'Bad',
          categoryId: 999999,
        })
      ).rejects.toBeInstanceOf(TransactionValidationError);

      // A category of the wrong type rejects the update.
      await expect(
        storage.updateTransaction(original.id, {
          type: 'expense',
          amountMinor: 9999,
          date: '2026-11-22',
          description: 'Bad',
          categoryId: salaryId,
        })
      ).rejects.toBeInstanceOf(TransactionValidationError);

      // A missing category rejects the update.
      await expect(
        storage.updateTransaction(original.id, {
          type: 'expense',
          amountMinor: 9999,
          date: '2026-11-22',
        })
      ).rejects.toBeInstanceOf(TransactionValidationError);

      // Every rejected update left the row unchanged.
      expect(await storage.getTransactionById(original.id)).toEqual(updated);
    } finally {
      close();
    }
  });

  test('stamps transaction edits and records a deletion tombstone', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createTransactionStorage(db);
    try {
      await storage.initialize();
      const foodId = await builtinCategoryId(db, 'expense', 'Food');
      const created = await storage.addTransaction({
        type: 'expense', amountMinor: 100, date: '2026-11-20', description: 'Lunch', categoryId: foodId,
      });
      await db.runAsync('UPDATE transactions SET updated_at = 1 WHERE id = ?;', created.id);
      const updated = await storage.updateTransaction(created.id, {
        type: 'expense', amountMinor: 200, date: '2026-11-21', description: 'Dinner', categoryId: foodId,
      });
      expect(updated.updatedAt).toBeGreaterThan(1);

      await storage.deleteTransaction(created.id);
      const tombstone = await db.getFirstAsync<{ entity_id: number; deleted_at: number }>(
        `SELECT entity_id, deleted_at FROM deleted_tombstones
         WHERE entity_type = 'transaction' AND entity_id = ?;`,
        created.id
      );
      expect(tombstone?.entity_id).toBe(created.id);
      expect(tombstone?.deleted_at).toBeGreaterThan(updated.updatedAt ?? 0);
    } finally {
      close();
    }
  });

  test('test_delete_transaction_removes_only_requested_row', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createTransactionStorage(db);
    try {
      await storage.initialize();
      const foodId = await builtinCategoryId(db, 'expense', 'Food');
      const salaryId = await builtinCategoryId(db, 'income', 'Salary');

      const a = await storage.addTransaction({
        type: 'expense', amountMinor: 100, date: '2026-11-20', description: 'keep-a', categoryId: foodId,
      });
      const b = await storage.addTransaction({
        type: 'expense', amountMinor: 200, date: '2026-11-21', description: 'delete-b', categoryId: foodId,
      });
      const c = await storage.addTransaction({
        type: 'income', amountMinor: 300, date: '2026-11-22', description: 'keep-c', categoryId: salaryId,
      });

      const categoriesBefore = await db.getAllAsync('SELECT id, type, name, is_builtin FROM categories ORDER BY id;');

      await expect(storage.deleteTransaction(b.id)).resolves.toBeUndefined();

      expect(await storage.getTransactionById(b.id)).toBeNull();
      const remaining = await storage.listTransactions();
      expect(remaining.map((t) => t.id)).toEqual([c.id, a.id]);
      expect(remaining.map((t) => t.description)).toEqual(['keep-c', 'keep-a']);
      expect(await db.getAllAsync('SELECT id, type, name, is_builtin FROM categories ORDER BY id;')).toEqual(
        categoriesBefore
      );

      // Deleting an unknown id is a documented no-op.
      await expect(storage.deleteTransaction(999999)).resolves.toBeUndefined();
      expect((await storage.listTransactions()).length).toBe(2);
    } finally {
      close();
    }
  });

  test('enforces foreign keys at runtime after initialization', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      const storage = createTransactionStorage(db);
      await storage.initialize();

      // Raw insert bypasses application validation; SQLite itself must reject
      // an orphan category_id now that foreign_keys is enabled per connection.
      await expect(
        db.runAsync(
          `INSERT INTO transactions (type, amount_minor, date, description, created_at, category_id)
           VALUES ('expense', 100, '2026-11-21', 'orphan', 1000, 999999);`
        )
      ).rejects.toThrow(/FOREIGN KEY/i);
    } finally {
      close();
    }
  });
});
