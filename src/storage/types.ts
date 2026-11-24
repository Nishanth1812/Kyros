export type TransactionType = 'income' | 'expense';

export interface Category {
  id: number;
  type: TransactionType;
  name: string;
  isBuiltin: boolean;
  isArchived: boolean;
  updatedAt?: number;
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
  listCategories(type?: TransactionType, includeArchived?: boolean): Promise<Category[]>;
  createCategory(input: NewCategoryInput): Promise<Category>;
  renameCategory(id: number, newName: string): Promise<Category>;
  archiveCategory(id: number, isArchived: boolean): Promise<Category>;
  deleteCategoryWithReassignment(
    idToDelete: number,
    targetCategoryId: number
  ): Promise<{ reassignedCount: number }>;
}

/**
 * A recurring monthly limit. `categoryId: null` is the overall budget; any
 * other value is the expense category the limit applies to.
 */
export interface Budget {
  id: number;
  categoryId: number | null;
  amountMinor: MinorUnits;
}

export interface NewBudgetInput {
  categoryId?: unknown;
  amountMinor: unknown;
}

export type BudgetValidationField = 'amountMinor' | 'categoryId';

export interface BudgetValidationErrorEntry {
  field: BudgetValidationField;
  message: string;
}

export class BudgetValidationError extends Error {
  readonly errors: BudgetValidationErrorEntry[];

  constructor(errors: BudgetValidationErrorEntry[]) {
    const message = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    super(message);
    this.name = 'BudgetValidationError';
    this.errors = errors;
  }
}

export interface BudgetStorage {
  initialize(): Promise<void>;
  /** Overall budget first, then category budgets ordered by category id. */
  listBudgets(): Promise<Budget[]>;
  /** Creates or updates the budget for the requested scope. */
  saveBudget(input: NewBudgetInput): Promise<Budget>;
  /** Deletes the requested row if present; an unknown id is a no-op. */
  deleteBudget(id: number): Promise<void>;
}

export interface TombstoneRecord {
  id: number;
  entityType: 'transaction' | 'category' | 'budget' | 'recurring' | 'goal';
  entityId: number;
  deletedAt: number;
}

export interface KyrosBackupMetadata {
  version: 1;
  appVersion: string;
  exportedAt: string;
}

export interface BackupCategory {
  id: number;
  type: TransactionType;
  name: string;
  isBuiltin: boolean;
}

export interface BackupTransaction {
  id: number;
  type: TransactionType;
  amountMinor: MinorUnits;
  date: string;
  description: string | null;
  createdAt: number;
  categoryId: number;
}

export interface BackupBudget {
  id: number;
  categoryId: number | null;
  amountMinor: MinorUnits;
}

export interface KyrosBackupData {
  categories: BackupCategory[];
  transactions: BackupTransaction[];
  budgets: BackupBudget[];
}

export interface KyrosBackupV1 {
  meta: KyrosBackupMetadata;
  data: KyrosBackupData;
}

export interface RestoreResult {
  categoriesCount: number;
  transactionsCount: number;
  budgetsCount: number;
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

