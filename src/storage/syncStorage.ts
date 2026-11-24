import { initializeSchema } from './schema';
import {
  BudgetRecord,
  Category,
  FinancialGoal,
  RecurringTransaction,
  SQLiteDatabaseLike,
  SyncStorage,
  SyncStorageInfo,
  TombstoneEntityType,
  TombstoneRecord,
  Transaction,
  TransactionType,
} from './types';

const TOMBSTONE_ENTITY_TYPES: ReadonlyArray<TombstoneEntityType> = [
  'transaction',
  'category',
  'budget',
  'recurring',
  'goal',
];

/**
 * Run `task` inside a single SQLite transaction so a failure leaves no partial
 * writes. Mirrors the fallback used by the other storages for the native
 * module, which does not expose `withTransactionAsync`.
 */
export async function withAtomicTransaction<T>(
  db: SQLiteDatabaseLike,
  task: () => Promise<T>
): Promise<T> {
  if (typeof db.withTransactionAsync === 'function') {
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await task();
    });
    return result;
  }

  await db.execAsync('BEGIN;');
  try {
    const result = await task();
    await db.execAsync('COMMIT;');
    return result;
  } catch (err) {
    try {
      await db.execAsync('ROLLBACK;');
    } catch {
      // ignore rollback errors
    }
    throw err;
  }
}

export function isTombstoneEntityType(value: unknown): value is TombstoneEntityType {
  return typeof value === 'string' && TOMBSTONE_ENTITY_TYPES.includes(value as TombstoneEntityType);
}

/** Truncate to an integer epoch-ms value; non-finite input becomes 0. */
export function toEpochMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

/**
 * Rows written before the v4 schema (or by writers that do not stamp changes)
 * carry `updated_at = 0`. Treat `created_at` as their last change so they are
 * still visible to a delta instead of being silently dropped.
 */
function effectiveTimestamp(updatedAt: unknown, createdAt: number): number {
  const updated = toEpochMs(updatedAt);
  return updated > 0 ? updated : toEpochMs(createdAt);
}

interface TransactionRow {
  id: number;
  type: TransactionType;
  amount_minor: number;
  date: string;
  description: string | null;
  created_at: number;
  category_id: number;
  updated_at: number | null;
}

interface CategoryRow {
  id: number;
  type: TransactionType;
  name: string;
  is_builtin: number;
  is_archived: number;
  updated_at: number | null;
}

interface BudgetRow {
  id: number;
  category_id: number | null;
  amount_minor: number;
  updated_at: number | null;
}

interface GoalRow {
  id: number;
  title: string;
  target_amount_minor: number;
  current_saved_minor: number;
  target_date: string | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: number;
  updated_at: number;
}

interface RecurringRow {
  id: number;
  amount_minor: number;
  type: TransactionType;
  category_id: number;
  description: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  next_due_date: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface TombstoneRow {
  id: number;
  entity_type: string;
  entity_id: number;
  deleted_at: number;
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amount_minor,
    date: row.date,
    description: row.description ?? null,
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: effectiveTimestamp(row.updated_at, row.created_at),
  };
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    isBuiltin: row.is_builtin === 1,
    isArchived: row.is_archived === 1,
    updatedAt: toEpochMs(row.updated_at),
  };
}

function rowToBudget(row: BudgetRow): BudgetRecord {
  return {
    id: row.id,
    categoryId: row.category_id,
    amountMinor: row.amount_minor,
    updatedAt: toEpochMs(row.updated_at),
  };
}

function rowToGoal(row: GoalRow): FinancialGoal {
  return {
    id: row.id,
    title: row.title,
    targetAmountMinor: row.target_amount_minor,
    currentSavedMinor: row.current_saved_minor,
    targetDate: row.target_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRecurring(row: RecurringRow): RecurringTransaction {
  return {
    id: row.id,
    amountMinor: row.amount_minor,
    type: row.type,
    categoryId: row.category_id,
    description: row.description,
    frequency: row.frequency,
    nextDueDate: row.next_due_date,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTombstone(row: TombstoneRow): TombstoneRecord {
  return {
    id: row.id,
    entityType: (isTombstoneEntityType(row.entity_type)
      ? row.entity_type
      : 'transaction') as TombstoneEntityType,
    entityId: row.entity_id,
    deletedAt: row.deleted_at,
  };
}

export function createSyncStorage(db: SQLiteDatabaseLike): SyncStorage {
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (!initPromise) {
      initPromise = (async () => {
        await initializeSchema(db);
        await db.runAsync(
          'UPDATE categories SET updated_at = ? WHERE updated_at = 0;',
          Math.trunc(Date.now())
        );
        initialized = true;
      })().catch((error) => {
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

    async recordTombstone(
      entityType: TombstoneEntityType,
      entityId: number,
      deletedAt?: number
    ): Promise<void> {
      await ensureInitialized();
      if (!isTombstoneEntityType(entityType)) {
        throw new Error(`Unknown tombstone entity type: ${String(entityType)}`);
      }
      if (!Number.isInteger(entityId) || entityId <= 0) {
        throw new Error(`Invalid tombstone entity id: ${String(entityId)}`);
      }
      const when = toEpochMs(deletedAt) || Math.trunc(Date.now());

      // Keep the existing marker identity while advancing only to newer deletes.
      await db.runAsync(
        `UPDATE deleted_tombstones
         SET deleted_at = MAX(deleted_at, ?)
         WHERE id = (
           SELECT id FROM deleted_tombstones
           WHERE entity_type = ? AND entity_id = ?
           ORDER BY deleted_at DESC, id ASC
           LIMIT 1
         );`,
        when,
        entityType,
        entityId
      );
      await db.runAsync(
        `INSERT INTO deleted_tombstones (entity_type, entity_id, deleted_at)
         SELECT ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM deleted_tombstones WHERE entity_type = ? AND entity_id = ?
         );`,
        entityType,
        entityId,
        when,
        entityType,
        entityId
      );
    },

    async clearTombstones(
      entityType: TombstoneEntityType,
      entityId: number
    ): Promise<void> {
      await ensureInitialized();
      await db.runAsync(
        'DELETE FROM deleted_tombstones WHERE entity_type = ? AND entity_id = ?;',
        entityType,
        entityId
      );
    },

    async listTombstones(sinceTimestamp: number = 0): Promise<TombstoneRecord[]> {
      await ensureInitialized();
      const since = toEpochMs(sinceTimestamp);
      const rows = await db.getAllAsync<TombstoneRow>(
        `SELECT id, entity_type, entity_id, deleted_at
         FROM deleted_tombstones
         WHERE deleted_at > ?
         ORDER BY deleted_at ASC, id ASC;`,
        since
      );
      return rows.map(rowToTombstone);
    },

    async getTombstone(
      entityType: TombstoneEntityType,
      entityId: number
    ): Promise<TombstoneRecord | null> {
      await ensureInitialized();
      const row = await db.getFirstAsync<TombstoneRow>(
        `SELECT id, entity_type, entity_id, deleted_at
         FROM deleted_tombstones
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY deleted_at DESC, id DESC
         LIMIT 1;`,
        entityType,
        entityId
      );
      return row ? rowToTombstone(row) : null;
    },

    async getSyncInfo(): Promise<SyncStorageInfo> {
      await ensureInitialized();
      const latest = await db.getFirstAsync<{ ts: number | null }>(
        `SELECT MAX(ts) AS ts FROM (
           SELECT COALESCE(NULLIF(updated_at, 0), created_at) AS ts FROM transactions
           UNION ALL
           SELECT COALESCE(NULLIF(updated_at, 0), 0) AS ts FROM categories
           UNION ALL
           SELECT COALESCE(NULLIF(updated_at, 0), 0) AS ts FROM budgets
           UNION ALL
           SELECT updated_at AS ts FROM recurring_transactions
           UNION ALL
           SELECT updated_at AS ts FROM financial_goals
         );`
      );
      const tombstones = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM deleted_tombstones;'
      );
      return {
        latestUpdatedAt: toEpochMs(latest?.ts),
        tombstoneCount: toEpochMs(tombstones?.count),
      };
    },

    async listChangedTransactions(sinceTimestamp: number): Promise<Transaction[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<TransactionRow>(
        `SELECT id, type, amount_minor, date, description, created_at, category_id, updated_at
         FROM transactions
         WHERE COALESCE(NULLIF(updated_at, 0), created_at) > ?
         ORDER BY id ASC;`,
        toEpochMs(sinceTimestamp)
      );
      return rows.map(rowToTransaction);
    },

    async listChangedCategories(sinceTimestamp: number): Promise<Category[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<CategoryRow>(
        `SELECT id, type, name, is_builtin, is_archived, updated_at
         FROM categories
         WHERE COALESCE(NULLIF(updated_at, 0), ?) > ?
         ORDER BY id ASC;`,
        Math.trunc(Date.now()),
        toEpochMs(sinceTimestamp)
      );
      return rows.map(rowToCategory);
    },

    async listChangedBudgets(sinceTimestamp: number): Promise<BudgetRecord[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<BudgetRow>(
        `SELECT id, category_id, amount_minor, updated_at
         FROM budgets
         WHERE updated_at > ?
         ORDER BY id ASC;`,
        toEpochMs(sinceTimestamp)
      );
      return rows.map(rowToBudget);
    },

    async listChangedGoals(sinceTimestamp: number): Promise<FinancialGoal[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<GoalRow>(
        `SELECT id, title, target_amount_minor, current_saved_minor, target_date, status, created_at, updated_at
         FROM financial_goals
         WHERE updated_at > ?
         ORDER BY id ASC;`,
        toEpochMs(sinceTimestamp)
      );
      return rows.map(rowToGoal);
    },

    async listChangedRecurring(sinceTimestamp: number): Promise<RecurringTransaction[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<RecurringRow>(
        `SELECT id, amount_minor, type, category_id, description, frequency, next_due_date, is_active, created_at, updated_at
         FROM recurring_transactions
         WHERE updated_at > ?
         ORDER BY id ASC;`,
        toEpochMs(sinceTimestamp)
      );
      return rows.map(rowToRecurring);
    },
  };
}
