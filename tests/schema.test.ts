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

const V2_SCHEMA_SQL = `
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    name TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1))
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
    date TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id)
  );
  CREATE INDEX idx_transactions_date_created
    ON transactions (date DESC, created_at DESC, id DESC);
  INSERT INTO categories (id, type, name, is_builtin) VALUES
    (1, 'expense', 'Food', 1),
    (2, 'expense', 'Custom', 0),
    (3, 'income', 'Salary', 1);
  INSERT INTO transactions
    (id, type, amount_minor, date, description, created_at, category_id)
  VALUES
    (7, 'income', 100000, '2026-01-05', 'Paycheck', 1000, 3),
    (12, 'expense', 2599, '2026-01-06', 'Lunch', 2000, 1),
    (20, 'expense', 45000, '2026-01-07', NULL, 3000, 2);
  PRAGMA user_version = 2;
`;

interface V2CategoryRow {
  id: number;
  type: string;
  name: string;
  is_builtin: number;
}

interface V2TransactionRow {
  id: number;
  type: string;
  amount_minor: number;
  date: string;
  description: string | null;
  created_at: number;
  category_id: number;
}

const EXPECTED_V2_CATEGORIES: V2CategoryRow[] = [
  { id: 1, type: 'expense', name: 'Food', is_builtin: 1 },
  { id: 2, type: 'expense', name: 'Custom', is_builtin: 0 },
  { id: 3, type: 'income', name: 'Salary', is_builtin: 1 },
];

const EXPECTED_V2_TRANSACTIONS: V2TransactionRow[] = [
  {
    id: 7,
    type: 'income',
    amount_minor: 100000,
    date: '2026-01-05',
    description: 'Paycheck',
    created_at: 1000,
    category_id: 3,
  },
  {
    id: 12,
    type: 'expense',
    amount_minor: 2599,
    date: '2026-01-06',
    description: 'Lunch',
    created_at: 2000,
    category_id: 1,
  },
  {
    id: 20,
    type: 'expense',
    amount_minor: 45000,
    date: '2026-01-07',
    description: null,
    created_at: 3000,
    category_id: 2,
  },
];

async function readV2Categories(db: Parameters<typeof initializeSchema>[0]) {
  return db.getAllAsync<V2CategoryRow>(
    'SELECT id, type, name, is_builtin FROM categories ORDER BY id;'
  );
}

async function readV2Transactions(db: Parameters<typeof initializeSchema>[0]) {
  return db.getAllAsync<V2TransactionRow>(
    `SELECT id, type, amount_minor, date, description, created_at, category_id
     FROM transactions ORDER BY id;`
  );
}

async function budgetTableCount(db: Parameters<typeof initializeSchema>[0]) {
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets';"
  );
  return tables.length;
}

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
      expect(await budgetTableCount(db)).toBe(1);
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
      expect(version?.user_version).toBe(SCHEMA_VERSION);
      expect(await budgetTableCount(db)).toBe(1);

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

  test('test_schema_latest_initialization_is_idempotent', async () => {
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
      expect(version?.user_version).toBe(SCHEMA_VERSION);
    } finally {
      close();
    }
  });

  test('test_v2_to_v3_migration_preserves_transactions_and_categories', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      await db.execAsync(V2_SCHEMA_SQL);

      await initializeSchema(db);

      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(SCHEMA_VERSION);
      expect(await budgetTableCount(db)).toBe(1);

      expect(await readV2Categories(db)).toEqual(EXPECTED_V2_CATEGORIES);
      expect(await readV2Transactions(db)).toEqual(EXPECTED_V2_TRANSACTIONS);
    } finally {
      close();
    }
  });

  test('test_v2_to_v3_migration_rolls_back_on_failure', async () => {
    const injected = new Error('injected v2 to v3 migration failure');
    const { db, close } = createBunSqliteAdapter(':memory:', {
      failBeforeCommit: injected,
    });
    try {
      await db.execAsync(V2_SCHEMA_SQL);

      await expect(initializeSchema(db)).rejects.toThrow(injected);

      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(2);
      expect(await budgetTableCount(db)).toBe(0);
      expect(await readV2Categories(db)).toEqual(EXPECTED_V2_CATEGORIES);
      expect(await readV2Transactions(db)).toEqual(EXPECTED_V2_TRANSACTIONS);
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
