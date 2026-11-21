import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { createTransactionStorage, type TransactionStorage } from '../storage';

const DATABASE_NAME = 'kyros.sqlite';

let storagePromise: Promise<TransactionStorage> | null = null;

/**
 * Lazily open the on-device database and hand it to the existing storage
 * layer. expo-sqlite's SQLiteDatabase exposes the async methods required by
 * SQLiteDatabaseLike, so no adapter is needed. A failed open is not cached,
 * so the user can retry from the error screen.
 */
export function getTransactionStorage(): Promise<TransactionStorage> {
  if (!storagePromise) {
    storagePromise = (async () => {
      const db: SQLiteDatabase = await openDatabaseAsync(DATABASE_NAME);
      const storage = createTransactionStorage(db);
      await storage.initialize();
      return storage;
    })().catch((error: unknown) => {
      storagePromise = null;
      throw error;
    });
  }
  return storagePromise;
}
