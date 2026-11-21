export type TransactionType = 'income' | 'expense';

/**
 * Amounts are stored and transferred as integer minor units (e.g. cents).
 * Floating-point values are never used for money.
 */
export type MinorUnits = number;

export interface Transaction {
  id: number;
  type: TransactionType;
  amountMinor: MinorUnits;
  /** Calendar date in ISO 8601 format (YYYY-MM-DD). */
  date: string;
  description: string | null;
  /** Creation timestamp in milliseconds since epoch, used for stable ordering. */
  createdAt: number;
}

export interface NewTransactionInput {
  type: unknown;
  amountMinor: unknown;
  date: unknown;
  description?: unknown;
}

export interface ValidatedNewTransaction {
  type: TransactionType;
  amountMinor: MinorUnits;
  date: string;
  description: string | null;
}

export type ValidationField = 'type' | 'amountMinor' | 'date' | 'description';

export interface ValidationError {
  field: ValidationField;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  value?: ValidatedNewTransaction;
}

export class TransactionValidationError extends Error {
  readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const message = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    super(message);
    this.name = 'TransactionValidationError';
    this.errors = errors;
  }
}

export interface ListTransactionsOptions {
  /** Defaults to 'date_desc' (newest first), with createdAt/id as tiebreakers. */
  order?: 'date_desc';
}

/**
 * Minimal async SQLite interface compatible with expo-sqlite's SQLiteDatabase.
 * Keeping this narrow makes the storage layer testable outside React Native.
 */
export interface SQLiteDatabaseLike {
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    ...params: any[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T = any>(source: string, ...params: any[]): Promise<T[]>;
  getFirstAsync<T = any>(source: string, ...params: any[]): Promise<T | null>;
  withTransactionAsync?(task: () => Promise<void>): Promise<void>;
}

export interface TransactionStorage {
  initialize(): Promise<void>;
  addTransaction(input: NewTransactionInput): Promise<Transaction>;
  listTransactions(options?: ListTransactionsOptions): Promise<Transaction[]>;
  getTransactionById(id: number): Promise<Transaction | null>;
}
