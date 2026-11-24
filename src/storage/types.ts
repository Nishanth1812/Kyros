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
  updatedAt?: number;
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

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringTransaction {
  id: number;
  amountMinor: MinorUnits;
  type: TransactionType;
  categoryId: number;
  description: string | null;
  frequency: RecurringFrequency;
  nextDueDate: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NewRecurringInput {
  amountMinor: unknown;
  type: unknown;
  categoryId: unknown;
  description?: unknown;
  frequency: unknown;
  nextDueDate: unknown;
  isActive?: boolean;
}

export interface RecurringStorage {
  initialize(): Promise<void>;
  listRecurring(): Promise<RecurringTransaction[]>;
  addRecurring(input: NewRecurringInput): Promise<RecurringTransaction>;
  updateRecurring(id: number, input: Partial<NewRecurringInput>): Promise<RecurringTransaction>;
  deleteRecurring(id: number): Promise<void>;
  toggleRecurringActive(id: number, isActive: boolean): Promise<RecurringTransaction>;
  applyRecurring(id: number, asOfDate?: string): Promise<{ transaction: Transaction; nextDueDate: string }>;
}

export interface FinancialGoal {
  id: number;
  title: string;
  targetAmountMinor: MinorUnits;
  currentSavedMinor: MinorUnits;
  targetDate: string | null;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
}

export interface NewGoalInput {
  title: unknown;
  targetAmountMinor: unknown;
  currentSavedMinor?: unknown;
  targetDate?: unknown;
  status?: 'active' | 'completed' | 'cancelled';
}

export interface GoalProgress {
  percentage: number;
  remainingMinor: number;
  isCompleted: boolean;
  projectedMonthlySavingsMinor?: number;
}

export interface GoalStorage {
  initialize(): Promise<void>;
  listGoals(): Promise<FinancialGoal[]>;
  addGoal(input: NewGoalInput): Promise<FinancialGoal>;
  updateGoal(id: number, input: Partial<NewGoalInput>): Promise<FinancialGoal>;
  deleteGoal(id: number): Promise<void>;
  contributeToGoal(id: number, deltaMinor: number): Promise<FinancialGoal>;
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

export type TombstoneEntityType = 'transaction' | 'category' | 'budget' | 'recurring' | 'goal';

export interface TombstoneRecord {
  id: number;
  entityType: TombstoneEntityType;
  entityId: number;
  deletedAt: number;
}

/** A budget row with the sync timestamp that orders it in a delta. */
export interface BudgetRecord extends Budget {
  updatedAt: number;
}

export interface SyncChanges {
  transactions: Transaction[];
  categories: Category[];
  budgets: BudgetRecord[];
  goals: FinancialGoal[];
  recurring: RecurringTransaction[];
}

/** Wire format for a delta exchange between two Kyros devices. */
export interface KyrosSyncDeltaV1 {
  version: 1;
  /** Epoch milliseconds when this delta was produced. */
  clientTimestamp: number;
  /** Epoch milliseconds the caller last synchronized through. */
  sinceTimestamp: number;
  changes: SyncChanges;
  tombstones: TombstoneRecord[];
}

export interface SyncEntityCounts {
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

export interface SyncReconciliationResult {
  transactions: SyncEntityCounts;
  categories: SyncEntityCounts;
  budgets: SyncEntityCounts;
  goals: SyncEntityCounts;
  recurring: SyncEntityCounts;
  tombstonesApplied: number;
}

export interface SyncStorageInfo {
  /** Newest `updated_at` value across every synchronized table (0 when empty). */
  latestUpdatedAt: number;
  tombstoneCount: number;
}

export interface SyncStorage {
  initialize(): Promise<void>;
  /** Record or advance the deletion marker for one entity, keeping one row per entity. */
  recordTombstone(
    entityType: TombstoneEntityType,
    entityId: number,
    deletedAt?: number
  ): Promise<void>;
  /** Remove every marker for one entity (used when a newer edit resurrects it). */
  clearTombstones(entityType: TombstoneEntityType, entityId: number): Promise<void>;
  listTombstones(sinceTimestamp?: number): Promise<TombstoneRecord[]>;
  getTombstone(
    entityType: TombstoneEntityType,
    entityId: number
  ): Promise<TombstoneRecord | null>;
  getSyncInfo(): Promise<SyncStorageInfo>;
  listChangedTransactions(sinceTimestamp: number): Promise<Transaction[]>;
  listChangedCategories(sinceTimestamp: number): Promise<Category[]>;
  listChangedBudgets(sinceTimestamp: number): Promise<BudgetRecord[]>;
  listChangedGoals(sinceTimestamp: number): Promise<FinancialGoal[]>;
  listChangedRecurring(sinceTimestamp: number): Promise<RecurringTransaction[]>;
}

export interface KyrosBackupMetadata {
  version: 1 | 2;
  appVersion: string;
  exportedAt: string;
}

export interface KyrosBackupMetadataV2 extends KyrosBackupMetadata {
  version: 2;
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

export interface BackupCategoryV2 {
  id: number;
  type: TransactionType;
  name: string;
  isBuiltin: boolean;
  isArchived: boolean;
  updatedAt: number;
}

export interface BackupTransactionV2 extends BackupTransaction {
  updatedAt: number;
}

export interface BackupBudgetV2 extends BackupBudget {
  updatedAt: number;
}

export interface BackupGoal {
  id: number;
  title: string;
  targetAmountMinor: MinorUnits;
  currentSavedMinor: MinorUnits;
  targetDate: string | null;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
}

export interface BackupRecurring {
  id: number;
  amountMinor: MinorUnits;
  type: TransactionType;
  categoryId: number;
  description: string | null;
  frequency: RecurringFrequency;
  nextDueDate: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BackupTombstone {
  id: number;
  entityType: TombstoneEntityType;
  entityId: number;
  deletedAt: number;
}

export interface KyrosBackupDataV2 extends KyrosBackupData {
  categories: BackupCategoryV2[];
  transactions: BackupTransactionV2[];
  budgets: BackupBudgetV2[];
  recurring: BackupRecurring[];
  goals: BackupGoal[];
  tombstones: BackupTombstone[];
}

/** Backup format introduced in Kyros 0.6; a strict superset of `KyrosBackupV1`. */
export interface KyrosBackupV2 extends KyrosBackupV1 {
  meta: KyrosBackupMetadataV2;
  data: KyrosBackupDataV2;
}

export interface RestoreResult {
  categoriesCount: number;
  transactionsCount: number;
  budgetsCount: number;
  recurringCount: number;
  goalsCount: number;
  tombstonesCount: number;
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

