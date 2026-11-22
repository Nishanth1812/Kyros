import { NativeModules } from 'react-native';

import {
  createCategoryStorage,
  createTransactionStorage,
  type CategoryStorage,
  type TransactionStorage,
} from '../storage';
import type { SQLiteDatabaseLike, SQLiteValue } from '../storage/types';

const DATABASE_NAME = 'kyros.sqlite';

interface NativeSQLiteModule {
  openDatabase(name: string): Promise<void>;
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    params: SQLiteValue[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, params: SQLiteValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: SQLiteValue[]): Promise<T | null>;
}

class NativeSQLiteDatabase implements SQLiteDatabaseLike {
  constructor(private readonly native: NativeSQLiteModule) {}

  execAsync(source: string): Promise<void> {
    return this.native.execAsync(source);
  }

  runAsync(source: string, ...params: SQLiteValue[]) {
    return this.native.runAsync(source, params);
  }

  getAllAsync<T>(source: string, ...params: SQLiteValue[]) {
    return this.native.getAllAsync<T>(source, params);
  }

  getFirstAsync<T>(source: string, ...params: SQLiteValue[]) {
    return this.native.getFirstAsync<T>(source, params);
  }
}

let databasePromise: Promise<NativeSQLiteDatabase> | null = null;

/** Open the single Android database connection shared by both storages. */
function getDatabase(): Promise<NativeSQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const native = NativeModules.KyrosSQLite as NativeSQLiteModule;
      await native.openDatabase(DATABASE_NAME);
      return new NativeSQLiteDatabase(native);
    })().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

let storagePromise: Promise<TransactionStorage> | null = null;

/** Lazily opens the existing Android database and initializes its schema. */
export function getTransactionStorage(): Promise<TransactionStorage> {
  if (!storagePromise) {
    storagePromise = (async () => {
      const storage = createTransactionStorage(await getDatabase());
      await storage.initialize();
      return storage;
    })().catch((error: unknown) => {
      storagePromise = null;
      throw error;
    });
  }
  return storagePromise;
}

let categoryStoragePromise: Promise<CategoryStorage> | null = null;

/** Lazily opens the same database and initializes its category schema. */
export function getCategoryStorage(): Promise<CategoryStorage> {
  if (!categoryStoragePromise) {
    categoryStoragePromise = (async () => {
      // Transaction storage owns schema setup. Await it first so the two
      // storages never open competing migrations on a single connection.
      await getTransactionStorage();
      const storage = createCategoryStorage(await getDatabase());
      await storage.initialize();
      return storage;
    })().catch((error: unknown) => {
      categoryStoragePromise = null;
      throw error;
    });
  }
  return categoryStoragePromise;
}
