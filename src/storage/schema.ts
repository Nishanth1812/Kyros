import { SQLiteDatabaseLike, TransactionType } from './types';

export const SCHEMA_VERSION = 3;

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

export const CREATE_CATEGORIES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  name TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1))
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
  category_id INTEGER NOT NULL REFERENCES categories(id)
);
`;
}

export const CREATE_TRANSACTIONS_TABLE_SQL = createTransactionsTableSql('transactions');

const CREATE_TRANSACTIONS_V2_TABLE_SQL = createTransactionsTableSql('transactions_v2');

export const CREATE_TRANSACTIONS_DATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_transactions_date_created
ON transactions (date DESC, created_at DESC, id DESC);
`;

/**
 * A null category_id is the overall budget; any other value is a budget for
 * that expense category. Amounts use the same integer-paise rule as
 * transactions.
 */
export const CREATE_BUDGETS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  CHECK (category_id IS NULL OR category_id > 0)
);
`;

/**
 * SQLite treats NULL values as distinct in a unique index, so a plain unique
 * index on category_id would allow multiple overall budgets. Coalescing to 0
 * (category ids are always positive) permits one overall budget and one budget
 * per category.
 */
export const CREATE_BUDGETS_SCOPE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_scope
ON budgets (COALESCE(category_id, 0));
`;

/**
 * Seed built-in categories without duplicating ones that are already present.
 * Parameterized and safe to call more than once.
 */
async function seedBuiltinCategories(db: SQLiteDatabaseLike): Promise<void> {
  for (const { type, name } of BUILTIN_CATEGORIES) {
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

/**
 * Rebuild the v1 transactions table with a required category_id, mapping every
 * existing row to the "Other" category of its own type while keeping its ID
 * and all values unchanged.
 */
async function migrateV1ToV2(db: SQLiteDatabaseLike): Promise<void> {
  await db.execAsync(CREATE_CATEGORIES_TABLE_SQL);
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

  // Only mark the database upgraded once every step above has succeeded.
  await db.execAsync('PRAGMA user_version = 2;');
}

/** Add budget storage without touching existing transaction or category rows. */
async function migrateV2ToV3(db: SQLiteDatabaseLike): Promise<void> {
  await db.execAsync(CREATE_BUDGETS_TABLE_SQL);
  await db.execAsync(CREATE_BUDGETS_SCOPE_INDEX_SQL);

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

/**
 * Safely initialize or migrate the local database schema.
 * Uses PRAGMA user_version for idempotent, upgrade-safe initialization.
 */
export async function initializeSchema(db: SQLiteDatabaseLike): Promise<void> {
  // PRAGMA foreign_keys is a no-op inside a transaction, so it must be set on
  // the connection before BEGIN (and again on every new connection).
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
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    } else {
      if (currentVersion < 2) {
        await migrateV1ToV2(db);
      }
      if (currentVersion < 3) {
        await migrateV2ToV3(db);
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
}
