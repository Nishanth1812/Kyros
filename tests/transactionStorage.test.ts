import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTransactionStorage } from '../src/storage';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';

const tempDirs: string[] = [];

function makeTempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'kyros-storage-'));
  tempDirs.push(dir);
  return join(dir, 'kyros.sqlite');
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
      const income = await storage.addTransaction({
        type: 'income',
        amountMinor: 10000,
        date: '2026-11-20',
        description: 'Paycheck',
      });
      const expense = await storage.addTransaction({
        type: 'expense',
        amountMinor: 2599,
        date: '2026-11-21',
        description: 'Groceries',
      });

      expect(income.id).toBeGreaterThan(0);
      expect(income.type).toBe('income');
      expect(income.amountMinor).toBe(10000);
      expect(income.date).toBe('2026-11-20');
      expect(income.description).toBe('Paycheck');
      expect(typeof income.createdAt).toBe('number');

      expect(expense.type).toBe('expense');
      expect(expense.amountMinor).toBe(2599);

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
        `INSERT INTO transactions (type, amount_minor, date, description, created_at) VALUES
         ('income', 100, '2026-11-19', 'older', 1000),
         ('expense', 200, '2026-11-21', 'newest-date', 1000),
         ('expense', 300, '2026-11-20', 'middle-a', 1000),
         ('income', 400, '2026-11-20', 'middle-b-later-created', 2000);`
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
      await storage1.addTransaction({
        type: 'income',
        amountMinor: 7777,
        date: '2026-11-21',
        description: 'Persist me',
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
      expect(version?.user_version).toBe(1);
    } finally {
      second.close();
    }
  });
});
