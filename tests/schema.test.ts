import { describe, expect, test } from 'bun:test';
import { createTransactionStorage, initializeSchema, SCHEMA_VERSION } from '../src/storage';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';

const V1_SCHEMA_SQL = `
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
    date TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_transactions_date_created
    ON transactions (date DESC, created_at DESC, id DESC);
  PRAGMA user_version = 1;
`;

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

  test('test_schema_v1_migration_preserves_transactions_and_assigns_other', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      await db.execAsync(V1_SCHEMA_SQL);
      await db.runAsync(
        `INSERT INTO transactions (id, type, amount_minor, date, description, created_at) VALUES
           (7, 'income', 100000, '2026-01-05', 'Paycheck', 1000),
           (12, 'expense', 2599, '2026-01-06', 'Lunch', 2000);`
      );

      await initializeSchema(db);

      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(2);

      const rows = await db.getAllAsync<{
        id: number;
        type: string;
        amount_minor: number;
        date: string;
        description: string | null;
        created_at: number;
        category_type: string;
        category_name: string;
      }>(
        `SELECT t.id, t.type, t.amount_minor, t.date, t.description, t.created_at,
                c.type AS category_type, c.name AS category_name
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         ORDER BY t.id;`
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        id: 7,
        type: 'income',
        amount_minor: 100000,
        date: '2026-01-05',
        description: 'Paycheck',
        created_at: 1000,
        category_type: 'income',
        category_name: 'Other',
      });
      expect(rows[1]).toMatchObject({
        id: 12,
        type: 'expense',
        amount_minor: 2599,
        date: '2026-01-06',
        description: 'Lunch',
        created_at: 2000,
        category_type: 'expense',
        category_name: 'Other',
      });
      expect(Number.isInteger(rows[0].amount_minor)).toBe(true);
      expect(Number.isInteger(rows[1].amount_minor)).toBe(true);

      const indexes = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_transactions_date_created';"
      );
      expect(indexes.length).toBe(1);
    } finally {
      close();
    }
  });

  test('test_schema_v2_initialization_is_idempotent', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      await initializeSchema(db);
      const readCategories = () =>
        db.getAllAsync<{ type: string; name: string; is_builtin: number }>(
          'SELECT type, name, is_builtin FROM categories ORDER BY type, name;'
        );

      const first = await readCategories();
      expect(first).toHaveLength(12);
      expect(first.every((row) => row.is_builtin === 1)).toBe(true);

      await initializeSchema(db);
      await initializeSchema(db);

      const again = await readCategories();
      expect(again).toEqual(first);

      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(2);
    } finally {
      close();
    }
  });

  test('test_schema_v1_migration_rolls_back_on_failure', async () => {
    const injected = new Error('injected migration failure');
    const { db, close } = createBunSqliteAdapter(':memory:', {
      failBeforeCommit: injected,
    });
    try {
      await db.execAsync(V1_SCHEMA_SQL);
      await db.runAsync(
        `INSERT INTO transactions (id, type, amount_minor, date, description, created_at) VALUES
           (7, 'income', 100000, '2026-01-05', 'Paycheck', 1000),
           (12, 'expense', 2599, '2026-01-06', 'Lunch', 2000);`
      );

      await expect(initializeSchema(db)).rejects.toThrow(injected);

      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(1);

      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions);');
      expect(columns.map((column) => column.name)).not.toContain('category_id');

      const rows = await db.getAllAsync<{
        id: number;
        type: string;
        amount_minor: number;
        date: string;
        description: string | null;
        created_at: number;
      }>(
        `SELECT id, type, amount_minor, date, description, created_at
         FROM transactions ORDER BY id;`
      );
      expect(rows).toEqual([
        {
          id: 7,
          type: 'income',
          amount_minor: 100000,
          date: '2026-01-05',
          description: 'Paycheck',
          created_at: 1000,
        },
        {
          id: 12,
          type: 'expense',
          amount_minor: 2599,
          date: '2026-01-06',
          description: 'Lunch',
          created_at: 2000,
        },
      ]);

      const categories = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='categories';"
      );
      expect(categories).toHaveLength(0);
    } finally {
      close();
    }
  });
});
