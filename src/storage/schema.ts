import { SQLiteDatabaseLike, TransactionType } from './types';

export const SCHEMA_VERSION = 4;

/** Built-in categories seeded on fresh installs and during the v1 -> v2 migration. */
export const BUILTIN_CATEGORIES: ReadonlyArray<{ type: TransactionType; name: string }> = [
  { type: 'expense', name: 'Food' },
  { type: 'expense', name: 'Transport' },
  { type: 'expense', name: 'Home' },
  { type: 'expense', name: 'Bills' },
  { type: 'expense', name: 'Health' },
  { type: 'expense', name: 'Shopping' },
  { type: 'expense', name: 'Entertainment' },
  { type: 'expense', name: 'Other' },
  { type: 'income', name: 'Salary' },
  { type: 'income', name: 'Business' },
  { type: 'income', name: 'Gift' },
  { type: 'income', name: 'Other' },
];

/** V2 categories table used specifically for legacy v1 -> v2 migration. */
const CREATE_CATEGORIES_V2_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  name TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1))
);
`;

/** V4 categories table with archival and sync timestamp. */
export const CREATE_CATEGORIES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  name TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  updated_at INTEGER NOT NULL DEFAULT 0
);
`;

function createTransactionsTableSql(tableName: string): string {
  return `
CREATE TABLE IF NOT EXISTS ${tableName} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  date TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  updated_at INTEGER NOT NULL DEFAULT 0
);
`;
}

export const CREATE_TRANSACTIONS_TABLE_SQL = createTransactionsTableSql('transactions');

const CREATE_TRANSACTIONS_V2_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS transactions_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  date TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id)
);
`;

export const CREATE_TRANSACTIONS_DATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_transactions_date_created
ON transactions (date DESC, created_at DESC, id DESC);
`;

const CREATE_BUDGETS_V3_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  CHECK (category_id IS NULL OR category_id > 0)
);
`;

export const CREATE_BUDGETS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  updated_at INTEGER NOT NULL DEFAULT 0,
  CHECK (category_id IS NULL OR category_id > 0)
);
`;

export const CREATE_BUDGETS_SCOPE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_scope
ON budgets (COALESCE(category_id, 0));
`;

export const CREATE_RECURRING_TRANSACTIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  description TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_due_date TEXT NOT NULL CHECK (length(next_due_date) = 10),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export const CREATE_FINANCIAL_GOALS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS financial_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 60),
  target_amount_minor INTEGER NOT NULL CHECK (typeof(target_amount_minor) = 'integer' AND target_amount_minor > 0),
  current_saved_minor INTEGER NOT NULL DEFAULT 0 CHECK (typeof(current_saved_minor) = 'integer' AND current_saved_minor >= 0),
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export const CREATE_DELETED_TOMBSTONES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS deleted_tombstones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction', 'category', 'budget', 'recurring', 'goal')),
  entity_id INTEGER NOT NULL,
  deleted_at INTEGER NOT NULL
);
`;

/**
 * Key/value preferences (theme mode, future local flags). Created outside the
 * versioned migrations so it also appears on databases already at v4 without
 * touching `user_version`.
 */
export const CREATE_APP_SETTINGS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_V4_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_categories_type_archived ON categories(type, is_archived);
CREATE INDEX IF NOT EXISTS idx_transactions_updated_at ON transactions(updated_at);
CREATE INDEX IF NOT EXISTS idx_recurring_due_active ON recurring_transactions(is_active, next_due_date);
CREATE INDEX IF NOT EXISTS idx_goals_status ON financial_goals(status);
CREATE INDEX IF NOT EXISTS idx_tombstones_deleted_at ON deleted_tombstones(deleted_at);
`;

/**
 * Seed built-in categories without duplicating ones that are already present.
 */
async function seedBuiltinCategories(db: SQLiteDatabaseLike): Promise<void> {
  const catCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(categories);');
  const hasV4Cols = catCols.some((c) => c.name === 'is_archived');
  const now = Date.now();

  for (const { type, name } of BUILTIN_CATEGORIES) {
    if (hasV4Cols) {
      await db.runAsync(
        `INSERT INTO categories (type, name, is_builtin, is_archived, updated_at)
         SELECT ?, ?, 1, 0, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM categories WHERE type = ? AND name = ?
         );`,
        type,
        name,
        now,
        type,
        name
      );
    } else {
      await db.runAsync(
        `INSERT INTO categories (type, name, is_builtin)
         SELECT ?, ?, 1
         WHERE NOT EXISTS (
           SELECT 1 FROM categories WHERE type = ? AND name = ?
         );`,
        type,
        name,
        type,
        name
      );
    }
  }
}

/**
 * Rebuild the v1 transactions table with a required category_id, mapping every
 * existing row to the "Other" category of its own type while keeping its ID
 * and all values unchanged.
 */
async function migrateV1ToV2(db: SQLiteDatabaseLike): Promise<void> {
  await db.execAsync(CREATE_CATEGORIES_V2_TABLE_SQL);
  await seedBuiltinCategories(db);

  await db.execAsync(CREATE_TRANSACTIONS_V2_TABLE_SQL);
  await db.execAsync(`
    INSERT INTO transactions_v2
      (id, type, amount_minor, date, description, created_at, category_id)
    SELECT t.id, t.type, t.amount_minor, t.date, t.description, t.created_at,
           (SELECT c.id FROM categories c WHERE c.type = t.type AND c.name = 'Other')
    FROM transactions t;
  `);
  await db.execAsync('DROP TABLE transactions;');
  await db.execAsync('ALTER TABLE transactions_v2 RENAME TO transactions;');
  await db.execAsync(CREATE_TRANSACTIONS_DATE_INDEX_SQL);

  await db.execAsync('PRAGMA user_version = 2;');
}

/** Add budget storage without touching existing transaction or category rows. */
async function migrateV2ToV3(db: SQLiteDatabaseLike): Promise<void> {
  await db.execAsync(CREATE_BUDGETS_V3_TABLE_SQL);
  await db.execAsync(CREATE_BUDGETS_SCOPE_INDEX_SQL);

  await db.execAsync('PRAGMA user_version = 3;');
}

/** Upgrade v3 to v4: add timestamps, archival status, recurring, goals, and tombstones. */
async function migrateV3ToV4(db: SQLiteDatabaseLike): Promise<void> {
  const catCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(categories);');
  const catColNames = new Set(catCols.map((c) => c.name));
  if (!catColNames.has('is_archived')) {
    await db.execAsync('ALTER TABLE categories ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1));');
  }
  if (!catColNames.has('updated_at')) {
    await db.execAsync('ALTER TABLE categories ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;');
  }

  const txCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions);');
  const txColNames = new Set(txCols.map((c) => c.name));
  if (!txColNames.has('updated_at')) {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;');
  }

  const bgCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(budgets);');
  const bgColNames = new Set(bgCols.map((c) => c.name));
  if (!bgColNames.has('updated_at')) {
    await db.execAsync('ALTER TABLE budgets ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;');
  }

  await db.execAsync('UPDATE transactions SET updated_at = created_at WHERE updated_at = 0;');
  const now = Date.now();
  await db.runAsync('UPDATE categories SET updated_at = ? WHERE updated_at = 0;', now);
  await db.runAsync('UPDATE budgets SET updated_at = ? WHERE updated_at = 0;', now);

  await db.execAsync(CREATE_RECURRING_TRANSACTIONS_TABLE_SQL);
  await db.execAsync(CREATE_FINANCIAL_GOALS_TABLE_SQL);
  await db.execAsync(CREATE_DELETED_TOMBSTONES_TABLE_SQL);
  await db.execAsync(CREATE_V4_INDEXES_SQL);

  await db.execAsync('PRAGMA user_version = 4;');
}

/**
 * Safely initialize or migrate the local database schema.
 * Uses PRAGMA user_version for idempotent, upgrade-safe initialization.
 */
export async function initializeSchema(db: SQLiteDatabaseLike): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const migrate = async () => {
    const row = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version;'
    );
    const currentVersion = row?.user_version ?? 0;

    if (currentVersion > SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${currentVersion} is newer than supported version ${SCHEMA_VERSION}.`
      );
    }

    if (currentVersion < 1) {
      // Fresh install: create the latest schema directly.
      await db.execAsync(CREATE_CATEGORIES_TABLE_SQL);
      await seedBuiltinCategories(db);
      await db.execAsync(CREATE_TRANSACTIONS_TABLE_SQL);
      await db.execAsync(CREATE_TRANSACTIONS_DATE_INDEX_SQL);
      await db.execAsync(CREATE_BUDGETS_TABLE_SQL);
      await db.execAsync(CREATE_BUDGETS_SCOPE_INDEX_SQL);
      await db.execAsync(CREATE_RECURRING_TRANSACTIONS_TABLE_SQL);
      await db.execAsync(CREATE_FINANCIAL_GOALS_TABLE_SQL);
      await db.execAsync(CREATE_DELETED_TOMBSTONES_TABLE_SQL);
      await db.execAsync(CREATE_V4_INDEXES_SQL);
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    } else {
      if (currentVersion < 2) {
        await migrateV1ToV2(db);
      }
      if (currentVersion < 3) {
        await migrateV2ToV3(db);
      }
      if (currentVersion < 4) {
        await migrateV3ToV4(db);
      }
    }
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(migrate);
  } else {
    await db.execAsync('BEGIN;');
    try {
      await migrate();
      await db.execAsync('COMMIT;');
    } catch (err) {
      try {
        await db.execAsync('ROLLBACK;');
      } catch {
        // ignore rollback errors
      }
      throw err;
    }
  }

  // Unversioned, additive table: ensure it exists on every initialize, including
  // databases that reached v4 before settings storage was introduced.
  await db.execAsync(CREATE_APP_SETTINGS_TABLE_SQL);
}
