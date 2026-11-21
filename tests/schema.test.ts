import { describe, expect, test } from 'bun:test';
import { createTransactionStorage, initializeSchema, SCHEMA_VERSION } from '../src/storage';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';

describe('schema initialization', () => {
  test('initializes schema safely and sets user_version', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      await initializeSchema(db);
      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(SCHEMA_VERSION);

      const tables = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions';"
      );
      expect(tables.length).toBe(1);
    } finally {
      close();
    }
  });

  test('initialization is idempotent', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      await initializeSchema(db);
      await initializeSchema(db);
      await initializeSchema(db);

      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(SCHEMA_VERSION);

      const indexes = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_transactions_date_created';"
      );
      expect(indexes.length).toBe(1);
    } finally {
      close();
    }
  });

  test('rejects newer unsupported schema versions', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1};`);
      await expect(initializeSchema(db)).rejects.toThrow(/newer than supported/i);
    } finally {
      close();
    }
  });

  test('enforces integer minor units and positive amounts at DB level', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createTransactionStorage(db);
    try {
      await storage.initialize();
      await expect(
        db.runAsync(
          `INSERT INTO transactions (type, amount_minor, date, description, created_at)
           VALUES ('income', 0, '2026-01-01', null, 1);`
        )
      ).rejects.toThrow();

      await expect(
        db.runAsync(
          `INSERT INTO transactions (type, amount_minor, date, description, created_at)
           VALUES ('expense', -10, '2026-01-01', null, 1);`
        )
      ).rejects.toThrow();
      await expect(
        db.runAsync(
          `INSERT INTO transactions (type, amount_minor, date, description, created_at)
           VALUES ('expense', 12.5, '2026-01-01', null, 1);`
        )
      ).rejects.toThrow();
    } finally {
      close();
    }
  });
});
