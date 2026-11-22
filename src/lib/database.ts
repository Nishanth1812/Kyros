import { NativeModules } from 'react-native';

import { createTransactionStorage, type TransactionStorage } from '../storage';
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

let storagePromise: Promise<TransactionStorage> | null = null;

/** Lazily opens the existing Android database and initializes its schema. */
export function getTransactionStorage(): Promise<TransactionStorage> {
  if (!storagePromise) {
    storagePromise = (async () => {
      const native = NativeModules.KyrosSQLite as NativeSQLiteModule;
      await native.openDatabase(DATABASE_NAME);
      const storage = createTransactionStorage(new NativeSQLiteDatabase(native));
      await storage.initialize();
      return storage;
    })().catch((error: unknown) => {
      storagePromise = null;
      throw error;
    });
  }
  return storagePromise;
}
