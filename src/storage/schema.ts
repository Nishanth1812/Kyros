import { SQLiteDatabaseLike } from './types';

export const SCHEMA_VERSION = 1;

export const CREATE_TRANSACTIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  date TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL
);
`;

export const CREATE_TRANSACTIONS_DATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_transactions_date_created
ON transactions (date DESC, created_at DESC, id DESC);
`;

/**
 * Safely initialize or migrate the local database schema.
 * Uses PRAGMA user_version for idempotent, upgrade-safe initialization.
 */
export async function initializeSchema(db: SQLiteDatabaseLike): Promise<void> {
  const migrate = async () => {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    const row = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version;'
    );
    const currentVersion = row?.user_version ?? 0;

    if (currentVersion < 1) {
      await db.execAsync(CREATE_TRANSACTIONS_TABLE_SQL);
      await db.execAsync(CREATE_TRANSACTIONS_DATE_INDEX_SQL);
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    } else if (currentVersion > SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${currentVersion} is newer than supported version ${SCHEMA_VERSION}.`
      );
    }

    // Future migrations: if (currentVersion < 2) { ...; PRAGMA user_version = 2; }
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
