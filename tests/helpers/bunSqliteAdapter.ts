import { Database } from 'bun:sqlite';
import type { SQLiteDatabaseLike } from '../../src/storage/types';

export interface BunSqliteAdapterOptions {
  /**
   * When set, throw this error after a transactional task has run but before
   * COMMIT, so rollback behavior can be verified in tests.
   */
  failBeforeCommit?: Error;
}

/**
 * Adapts bun:sqlite's synchronous Database to the async SQLiteDatabaseLike
 * interface used by the storage layer.
 * Intended for Node/Bun test verification only.
 */
export function createBunSqliteAdapter(
  filename: string = ':memory:',
  options: BunSqliteAdapterOptions = {}
): {
  db: SQLiteDatabaseLike;
  raw: Database;
  close: () => void;
} {
  const raw = new Database(filename, { create: true });

  const db: SQLiteDatabaseLike = {
    async execAsync(source: string): Promise<void> {
      raw.exec(source);
    },

    async runAsync(source: string, ...params: any[]) {
      const stmt = raw.query(source);
      const result = stmt.run(...params) as any;
      const lastInsertRowId = Number(
        result?.lastInsertRowId ?? result?.lastInsertRowid ?? 0
      );
      const changes = Number(result?.changes ?? 0);
      return { lastInsertRowId, changes };
    },

    async getAllAsync<T = any>(source: string, ...params: any[]): Promise<T[]> {
      const stmt = raw.query(source);
      return stmt.all(...params) as T[];
    },

    async getFirstAsync<T = any>(source: string, ...params: any[]): Promise<T | null> {
      const stmt = raw.query(source);
      const row = stmt.get(...params) as T | null | undefined;
      return row ?? null;
    },

    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      // bun:sqlite transactions are synchronous; execute task steps sequentially.
      raw.exec('BEGIN;');
      try {
        await task();
        if (options.failBeforeCommit) {
          throw options.failBeforeCommit;
        }
        raw.exec('COMMIT;');
      } catch (err) {
        try {
          raw.exec('ROLLBACK;');
        } catch {
          // ignore
        }
        throw err;
      }
    },
  };

  return {
    db,
    raw,
    close: () => raw.close(),
  };
}
