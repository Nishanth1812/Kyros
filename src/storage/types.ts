export type TransactionType = 'income' | 'expense';

export interface Category {
  id: number;
  type: TransactionType;
  name: string;
  isBuiltin: boolean;
}

export interface NewCategoryInput {
  type: TransactionType;
  name: string;
}

export type CategoryValidationField = 'type' | 'name';

export interface CategoryValidationErrorEntry {
  field: CategoryValidationField;
  message: string;
}

export interface CategoryValidationResult {
  ok: boolean;
  errors: CategoryValidationErrorEntry[];
  value?: NewCategoryInput;
}

export class CategoryValidationError extends Error {
  readonly errors: CategoryValidationErrorEntry[];

  constructor(errors: CategoryValidationErrorEntry[]) {
    const message = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    super(message);
    this.name = 'CategoryValidationError';
    this.errors = errors;
  }
}

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
  /** Category this transaction is assigned to; must match `type`. */
  categoryId: number;
  /** Creation timestamp in milliseconds since epoch, used for stable ordering. */
  createdAt: number;
}

export interface NewTransactionInput {
  type: unknown;
  amountMinor: unknown;
  date: unknown;
  description?: unknown;
  /** Required by the storage layer, which also checks existence and type. */
  categoryId?: unknown;
}

export interface ValidatedNewTransaction {
  type: TransactionType;
  amountMinor: MinorUnits;
  date: string;
  description: string | null;
}

export type ValidationField = 'type' | 'amountMinor' | 'date' | 'description' | 'categoryId';

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

/**
 * Minimal async SQLite interface used by the storage layer.
 */
export type SQLiteValue = string | number | boolean | null;

export interface SQLiteDatabaseLike {
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    ...params: SQLiteValue[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T = Record<string, unknown>>(
    source: string,
    ...params: SQLiteValue[]
  ): Promise<T[]>;
  getFirstAsync<T = Record<string, unknown>>(
    source: string,
    ...params: SQLiteValue[]
  ): Promise<T | null>;
  withTransactionAsync?(task: () => Promise<void>): Promise<void>;
}

export interface TransactionStorage {
  initialize(): Promise<void>;
  addTransaction(input: NewTransactionInput): Promise<Transaction>;
  updateTransaction(id: number, input: NewTransactionInput): Promise<Transaction>;
  /** Deletes the requested row if present; an unknown id is a no-op. */
  deleteTransaction(id: number): Promise<void>;
  listTransactions(): Promise<Transaction[]>;
  getTransactionById(id: number): Promise<Transaction | null>;
}

export interface CategoryStorage {
  initialize(): Promise<void>;
  listCategories(type?: TransactionType): Promise<Category[]>;
  createCategory(input: NewCategoryInput): Promise<Category>;
}
