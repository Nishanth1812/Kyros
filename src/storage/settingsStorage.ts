import { initializeSchema } from './schema';
import type { SQLiteDatabaseLike } from './types';

export interface SettingsStorage {
  initialize(): Promise<void>;
  /** Returns the stored string, or `null` when the key has never been set. */
  getSetting(key: string): Promise<string | null>;
  /** Creates or replaces the value for `key`. */
  setSetting(key: string, value: string): Promise<void>;
}

interface SettingRow {
  value: string;
}

/**
 * Key/value preferences stored next to the financial data. The table is
 * created by `initializeSchema`, so it also appears on databases that were
 * already migrated to v4 before settings existed.
 */
export function createSettingsStorage(db: SQLiteDatabaseLike): SettingsStorage {
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (!initPromise) {
      initPromise = initializeSchema(db)
        .then(() => {
          initialized = true;
        })
        .catch((error) => {
          initPromise = null;
          throw error;
        });
    }
    await initPromise;
  }

  return {
    async initialize(): Promise<void> {
      await ensureInitialized();
    },

    async getSetting(key: string): Promise<string | null> {
      await ensureInitialized();
      const row = await db.getFirstAsync<SettingRow>(
        'SELECT value FROM app_settings WHERE key = ?;',
        key
      );
      return row?.value ?? null;
    },

    async setSetting(key: string, value: string): Promise<void> {
      await ensureInitialized();
      // Select-then-write avoids UPSERT syntax, which Android 7's bundled
      // SQLite does not support. The primary key still guarantees one row.
      const existing = await db.getFirstAsync<{ key: string }>(
        'SELECT key FROM app_settings WHERE key = ?;',
        key
      );
      if (existing) {
        await db.runAsync(
          'UPDATE app_settings SET value = ? WHERE key = ?;',
          value,
          key
        );
        return;
      }
      await db.runAsync(
        'INSERT INTO app_settings (key, value) VALUES (?, ?);',
        key,
        value
      );
    },
  };
}
