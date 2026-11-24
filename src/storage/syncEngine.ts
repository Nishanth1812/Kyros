import {
  createSyncStorage,
  toEpochMs,
  withAtomicTransaction,
} from './syncStorage';
import {
  BudgetRecord,
  Category,
  FinancialGoal,
  KyrosSyncDeltaV1,
  RecurringFrequency,
  RecurringTransaction,
  SQLiteDatabaseLike,
  SyncEntityCounts,
  SyncReconciliationResult,
  SyncStorage,
  TombstoneEntityType,
  TombstoneRecord,
  Transaction,
  TransactionType,
} from './types';
import { MAX_AMOUNT_MINOR_UNITS } from './validation';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES: ReadonlyArray<RecurringFrequency> = ['daily', 'weekly', 'monthly', 'yearly'];

/** Entity types in deletion order: dependents before the categories they point at. */
const TOMBSTONE_DELETE_ORDER: ReadonlyArray<TombstoneEntityType> = [
  'transaction',
  'recurring',
  'budget',
  'goal',
  'category',
];

function emptyCounts(): SyncEntityCounts {
  return { inserted: 0, updated: 0, deleted: 0, skipped: 0 };
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_REGEX.test(value);
}

function isConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /constraint|unique|foreign key|check/i.test(message);
}

/** A row's last-change timestamp, falling back to creation for legacy rows. */
function lastChanged(updatedAt: unknown, createdAt: number): number {
  const updated = toEpochMs(updatedAt);
  return updated > 0 ? updated : toEpochMs(createdAt);
}

/**
 * A tombstone wins when it is at least as new as the incoming record. An edit
 * strictly newer than a local tombstone resurrects the entity.
 */
async function isBlockedByTombstone(
  storage: SyncStorage,
  entityType: TombstoneEntityType,
  entityId: number,
  incomingTimestamp: number
): Promise<boolean> {
  const tombstone = await storage.getTombstone(entityType, entityId);
  if (!tombstone) return false;
  return tombstone.deletedAt >= incomingTimestamp;
}

async function resurrectIfNewer(
  storage: SyncStorage,
  entityType: TombstoneEntityType,
  entityId: number,
  incomingTimestamp: number
): Promise<void> {
  const tombstone = await storage.getTombstone(entityType, entityId);
  if (tombstone && tombstone.deletedAt < incomingTimestamp) {
    await storage.clearTombstones(entityType, entityId);
  }
}

/**
 * Build a delta containing every entity whose last change is newer than
 * `sinceTimestamp`, plus every tombstone recorded after it.
 */
export async function generateSyncDelta(
  db: SQLiteDatabaseLike,
  sinceTimestamp: number
): Promise<KyrosSyncDeltaV1> {
  const since = toEpochMs(sinceTimestamp);
  const storage = createSyncStorage(db);
  await storage.initialize();

  const transactions = await storage.listChangedTransactions(since);
  const categories = await storage.listChangedCategories(since);
  const budgets = await storage.listChangedBudgets(since);
  const goals = await storage.listChangedGoals(since);
  const recurring = await storage.listChangedRecurring(since);
  const tombstones = await storage.listTombstones(since);

  return {
    version: 1,
    clientTimestamp: Math.trunc(Date.now()),
    sinceTimestamp: since,
    changes: {
      transactions,
      categories,
      budgets,
      goals,
      recurring,
    },
    tombstones,
  };
}

async function deleteEntity(
  db: SQLiteDatabaseLike,
  storage: SyncStorage,
  entityType: TombstoneEntityType,
  entityId: number,
  deletedAt: number,
  counts: SyncEntityCounts
): Promise<void> {
  switch (entityType) {
    case 'transaction': {
      const row = await db.getFirstAsync<{ created_at: number; updated_at: number | null }>(
        'SELECT created_at, updated_at FROM transactions WHERE id = ?;',
        entityId
      );
      if (row && lastChanged(row.updated_at, row.created_at) <= deletedAt) {
        await db.runAsync('DELETE FROM transactions WHERE id = ?;', entityId);
        counts.deleted += 1;
      } else if (row) {
        counts.skipped += 1;
      }
      break;
    }
    case 'recurring': {
      const row = await db.getFirstAsync<{ created_at: number; updated_at: number }>(
        'SELECT created_at, updated_at FROM recurring_transactions WHERE id = ?;',
        entityId
      );
      if (row && lastChanged(row.updated_at, row.created_at) <= deletedAt) {
        await db.runAsync('DELETE FROM recurring_transactions WHERE id = ?;', entityId);
        counts.deleted += 1;
      } else if (row) {
        counts.skipped += 1;
      }
      break;
    }
    case 'budget': {
      const row = await db.getFirstAsync<{ updated_at: number | null }>(
        'SELECT updated_at FROM budgets WHERE id = ?;',
        entityId
      );
      if (row && toEpochMs(row.updated_at) <= deletedAt) {
        await db.runAsync('DELETE FROM budgets WHERE id = ?;', entityId);
        counts.deleted += 1;
      } else if (row) {
        counts.skipped += 1;
      }
      break;
    }
    case 'goal': {
      const row = await db.getFirstAsync<{ created_at: number; updated_at: number }>(
        'SELECT created_at, updated_at FROM financial_goals WHERE id = ?;',
        entityId
      );
      if (row && lastChanged(row.updated_at, row.created_at) <= deletedAt) {
        await db.runAsync('DELETE FROM financial_goals WHERE id = ?;', entityId);
        counts.deleted += 1;
      } else if (row) {
        counts.skipped += 1;
      }
      break;
    }
    case 'category': {
      const row = await db.getFirstAsync<{ updated_at: number | null }>(
        'SELECT updated_at FROM categories WHERE id = ?;',
        entityId
      );
      if (!row) break;
      if (toEpochMs(row.updated_at) > deletedAt) {
        counts.skipped += 1;
        return;
      }
      // Deleting a category that still owns rows would break foreign keys, and
      // reassigning money without the user's target category is unsafe. Leave
      // it in place; the local category management flow can reassign first.
      const dependents = await db.getFirstAsync<{ count: number }>(
        `SELECT (
           (SELECT COUNT(*) FROM transactions WHERE category_id = ?) +
           (SELECT COUNT(*) FROM recurring_transactions WHERE category_id = ?) +
           (SELECT COUNT(*) FROM budgets WHERE category_id = ?)
         ) AS count;`,
        entityId,
        entityId,
        entityId
      );
      if (toEpochMs(dependents?.count) > 0) {
        counts.skipped += 1;
        return;
      }
      await db.runAsync('DELETE FROM categories WHERE id = ?;', entityId);
      counts.deleted += 1;
      break;
    }
  }

  await storage.recordTombstone(entityType, entityId, deletedAt);
}

function applyCategory(
  db: SQLiteDatabaseLike,
  storage: SyncStorage,
  category: Category,
  counts: SyncEntityCounts
): Promise<void> {
  return (async () => {
    if (
      !category ||
      !isPositiveInt(category.id) ||
      (category.type !== 'income' && category.type !== 'expense') ||
      typeof category.name !== 'string' ||
      category.name.trim().length === 0 ||
      category.name.trim().length > 40
    ) {
      counts.skipped += 1;
      return;
    }
    const incomingTimestamp = toEpochMs(category.updatedAt);
    const local = await db.getFirstAsync<{ updated_at: number | null }>(
      'SELECT updated_at FROM categories WHERE id = ?;',
      category.id
    );
    if (local && toEpochMs(local.updated_at) >= incomingTimestamp) {
      counts.skipped += 1;
      return;
    }
    if (await isBlockedByTombstone(storage, 'category', category.id, incomingTimestamp)) {
      counts.skipped += 1;
      return;
    }
    await resurrectIfNewer(storage, 'category', category.id, incomingTimestamp);

    try {
      if (local) {
        await db.runAsync(
          `UPDATE categories SET type = ?, name = ?, is_builtin = ?, is_archived = ?, updated_at = ?
           WHERE id = ?;`,
          category.type,
          category.name.trim(),
          category.isBuiltin ? 1 : 0,
          category.isArchived ? 1 : 0,
          incomingTimestamp,
          category.id
        );
        counts.updated += 1;
      } else {
        await db.runAsync(
          `INSERT INTO categories (id, type, name, is_builtin, is_archived, updated_at)
           VALUES (?, ?, ?, ?, ?, ?);`,
          category.id,
          category.type,
          category.name.trim(),
          category.isBuiltin ? 1 : 0,
          category.isArchived ? 1 : 0,
          incomingTimestamp
        );
        counts.inserted += 1;
      }
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      counts.skipped += 1;
    }
  })();
}

function applyTransaction(
  db: SQLiteDatabaseLike,
  storage: SyncStorage,
  transaction: Transaction,
  counts: SyncEntityCounts
): Promise<void> {
  return (async () => {
    if (
      !transaction ||
      !isPositiveInt(transaction.id) ||
      (transaction.type !== 'income' && transaction.type !== 'expense') ||
      !isPositiveInt(transaction.amountMinor) ||
      transaction.amountMinor > MAX_AMOUNT_MINOR_UNITS ||
      !isValidDate(transaction.date) ||
      !isPositiveInt(transaction.categoryId) ||
      (transaction.description !== null &&
        transaction.description !== undefined &&
        typeof transaction.description !== 'string')
    ) {
      counts.skipped += 1;
      return;
    }

    const createdAt = toEpochMs(transaction.createdAt);
    const incomingTimestamp = lastChanged(transaction.updatedAt, createdAt);
    if (createdAt <= 0 || incomingTimestamp <= 0) {
      counts.skipped += 1;
      return;
    }

    const category = await db.getFirstAsync<{ type: TransactionType }>(
      'SELECT type FROM categories WHERE id = ?;',
      transaction.categoryId
    );
    if (!category || category.type !== transaction.type) {
      counts.skipped += 1;
      return;
    }

    const local = await db.getFirstAsync<{ created_at: number; updated_at: number | null }>(
      'SELECT created_at, updated_at FROM transactions WHERE id = ?;',
      transaction.id
    );
    if (local && lastChanged(local.updated_at, local.created_at) >= incomingTimestamp) {
      counts.skipped += 1;
      return;
    }
    if (await isBlockedByTombstone(storage, 'transaction', transaction.id, incomingTimestamp)) {
      counts.skipped += 1;
      return;
    }
    await resurrectIfNewer(storage, 'transaction', transaction.id, incomingTimestamp);

    const description =
      typeof transaction.description === 'string' && transaction.description.trim().length > 0
        ? transaction.description.trim()
        : null;

    try {
      if (local) {
        await db.runAsync(
          `UPDATE transactions
           SET type = ?, amount_minor = ?, date = ?, description = ?, category_id = ?, updated_at = ?
           WHERE id = ?;`,
          transaction.type,
          transaction.amountMinor,
          transaction.date,
          description,
          transaction.categoryId,
          incomingTimestamp,
          transaction.id
        );
        counts.updated += 1;
      } else {
        await db.runAsync(
          `INSERT INTO transactions
             (id, type, amount_minor, date, description, created_at, category_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          transaction.id,
          transaction.type,
          transaction.amountMinor,
          transaction.date,
          description,
          createdAt,
          transaction.categoryId,
          incomingTimestamp
        );
        counts.inserted += 1;
      }
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      counts.skipped += 1;
    }
  })();
}

function applyBudget(
  db: SQLiteDatabaseLike,
  storage: SyncStorage,
  budget: BudgetRecord,
  counts: SyncEntityCounts
): Promise<void> {
  return (async () => {
    if (
      !budget ||
      !isPositiveInt(budget.id) ||
      !isPositiveInt(budget.amountMinor) ||
      budget.amountMinor > MAX_AMOUNT_MINOR_UNITS ||
      (budget.categoryId !== null &&
        budget.categoryId !== undefined &&
        !isPositiveInt(budget.categoryId))
    ) {
      counts.skipped += 1;
      return;
    }
    const categoryId = budget.categoryId ?? null;
    const incomingTimestamp = toEpochMs(budget.updatedAt);

    if (categoryId !== null) {
      const category = await db.getFirstAsync<{ type: TransactionType }>(
        'SELECT type FROM categories WHERE id = ?;',
        categoryId
      );
      if (!category || category.type !== 'expense') {
        counts.skipped += 1;
        return;
      }
    }

    const localById = await db.getFirstAsync<{ updated_at: number | null }>(
      'SELECT updated_at FROM budgets WHERE id = ?;',
      budget.id
    );
    if (localById && toEpochMs(localById.updated_at) >= incomingTimestamp) {
      counts.skipped += 1;
      return;
    }
    if (await isBlockedByTombstone(storage, 'budget', budget.id, incomingTimestamp)) {
      counts.skipped += 1;
      return;
    }
    await resurrectIfNewer(storage, 'budget', budget.id, incomingTimestamp);

    const localForScope = localById
      ? null
      : await db.getFirstAsync<{ id: number; updated_at: number | null }>(
          'SELECT id, updated_at FROM budgets WHERE category_id IS ?;',
          categoryId
        );

    if (localForScope && toEpochMs(localForScope.updated_at) >= incomingTimestamp) {
      counts.skipped += 1;
      return;
    }

    try {
      if (localById) {
        await db.runAsync(
          'UPDATE budgets SET category_id = ?, amount_minor = ?, updated_at = ? WHERE id = ?;',
          categoryId,
          budget.amountMinor,
          incomingTimestamp,
          budget.id
        );
        counts.updated += 1;
      } else if (localForScope) {
        // A different id already owns this scope; the unique scope index means
        // the row is updated in place instead of duplicated.
        await db.runAsync(
          'UPDATE budgets SET amount_minor = ?, updated_at = ? WHERE id = ?;',
          budget.amountMinor,
          incomingTimestamp,
          localForScope.id
        );
        counts.updated += 1;
      } else {
        await db.runAsync(
          'INSERT INTO budgets (id, category_id, amount_minor, updated_at) VALUES (?, ?, ?, ?);',
          budget.id,
          categoryId,
          budget.amountMinor,
          incomingTimestamp
        );
        counts.inserted += 1;
      }
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      counts.skipped += 1;
    }
  })();
}

function applyGoal(
  db: SQLiteDatabaseLike,
  storage: SyncStorage,
  goal: FinancialGoal,
  counts: SyncEntityCounts
): Promise<void> {
  return (async () => {
    if (
      !goal ||
      !isPositiveInt(goal.id) ||
      typeof goal.title !== 'string' ||
      goal.title.trim().length === 0 ||
      goal.title.trim().length > 60 ||
      !isPositiveInt(goal.targetAmountMinor) ||
      goal.targetAmountMinor > MAX_AMOUNT_MINOR_UNITS ||
      !isNonNegativeInt(goal.currentSavedMinor) ||
      goal.currentSavedMinor > MAX_AMOUNT_MINOR_UNITS ||
      (goal.targetDate !== null &&
        goal.targetDate !== undefined &&
        !isValidDate(goal.targetDate)) ||
      (goal.status !== 'active' && goal.status !== 'completed' && goal.status !== 'cancelled')
    ) {
      counts.skipped += 1;
      return;
    }

    const createdAt = toEpochMs(goal.createdAt);
    const incomingTimestamp = lastChanged(goal.updatedAt, createdAt);
    if (createdAt <= 0 || incomingTimestamp <= 0) {
      counts.skipped += 1;
      return;
    }

    const local = await db.getFirstAsync<{ created_at: number; updated_at: number }>(
      'SELECT created_at, updated_at FROM financial_goals WHERE id = ?;',
      goal.id
    );
    if (local && lastChanged(local.updated_at, local.created_at) >= incomingTimestamp) {
      counts.skipped += 1;
      return;
    }
    if (await isBlockedByTombstone(storage, 'goal', goal.id, incomingTimestamp)) {
      counts.skipped += 1;
      return;
    }
    await resurrectIfNewer(storage, 'goal', goal.id, incomingTimestamp);

    const targetDate = goal.targetDate ? goal.targetDate : null;

    try {
      if (local) {
        await db.runAsync(
          `UPDATE financial_goals
           SET title = ?, target_amount_minor = ?, current_saved_minor = ?, target_date = ?, status = ?, updated_at = ?
           WHERE id = ?;`,
          goal.title.trim(),
          goal.targetAmountMinor,
          goal.currentSavedMinor,
          targetDate,
          goal.status,
          incomingTimestamp,
          goal.id
        );
        counts.updated += 1;
      } else {
        await db.runAsync(
          `INSERT INTO financial_goals
             (id, title, target_amount_minor, current_saved_minor, target_date, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          goal.id,
          goal.title.trim(),
          goal.targetAmountMinor,
          goal.currentSavedMinor,
          targetDate,
          goal.status,
          createdAt,
          incomingTimestamp
        );
        counts.inserted += 1;
      }
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      counts.skipped += 1;
    }
  })();
}

function applyRecurring(
  db: SQLiteDatabaseLike,
  storage: SyncStorage,
  recurring: RecurringTransaction,
  counts: SyncEntityCounts
): Promise<void> {
  return (async () => {
    if (
      !recurring ||
      !isPositiveInt(recurring.id) ||
      !isPositiveInt(recurring.amountMinor) ||
      recurring.amountMinor > MAX_AMOUNT_MINOR_UNITS ||
      (recurring.type !== 'income' && recurring.type !== 'expense') ||
      !isPositiveInt(recurring.categoryId) ||
      !FREQUENCIES.includes(recurring.frequency) ||
      !isValidDate(recurring.nextDueDate) ||
      (recurring.description !== null &&
        recurring.description !== undefined &&
        typeof recurring.description !== 'string')
    ) {
      counts.skipped += 1;
      return;
    }

    const createdAt = toEpochMs(recurring.createdAt);
    const incomingTimestamp = lastChanged(recurring.updatedAt, createdAt);
    if (createdAt <= 0 || incomingTimestamp <= 0) {
      counts.skipped += 1;
      return;
    }

    const category = await db.getFirstAsync<{ type: TransactionType }>(
      'SELECT type FROM categories WHERE id = ?;',
      recurring.categoryId
    );
    if (!category || category.type !== recurring.type) {
      counts.skipped += 1;
      return;
    }

    const local = await db.getFirstAsync<{ created_at: number; updated_at: number }>(
      'SELECT created_at, updated_at FROM recurring_transactions WHERE id = ?;',
      recurring.id
    );
    if (local && lastChanged(local.updated_at, local.created_at) >= incomingTimestamp) {
      counts.skipped += 1;
      return;
    }
    if (await isBlockedByTombstone(storage, 'recurring', recurring.id, incomingTimestamp)) {
      counts.skipped += 1;
      return;
    }
    await resurrectIfNewer(storage, 'recurring', recurring.id, incomingTimestamp);

    const description =
      typeof recurring.description === 'string' && recurring.description.trim().length > 0
        ? recurring.description.trim()
        : null;
    const isActive = recurring.isActive !== false ? 1 : 0;

    try {
      if (local) {
        await db.runAsync(
          `UPDATE recurring_transactions
           SET amount_minor = ?, type = ?, category_id = ?, description = ?, frequency = ?,
               next_due_date = ?, is_active = ?, updated_at = ?
           WHERE id = ?;`,
          recurring.amountMinor,
          recurring.type,
          recurring.categoryId,
          description,
          recurring.frequency,
          recurring.nextDueDate,
          isActive,
          incomingTimestamp,
          recurring.id
        );
        counts.updated += 1;
      } else {
        await db.runAsync(
          `INSERT INTO recurring_transactions
             (id, amount_minor, type, category_id, description, frequency, next_due_date,
              is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          recurring.id,
          recurring.amountMinor,
          recurring.type,
          recurring.categoryId,
          description,
          recurring.frequency,
          recurring.nextDueDate,
          isActive,
          createdAt,
          incomingTimestamp
        );
        counts.inserted += 1;
      }
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      counts.skipped += 1;
    }
  })();
}

/**
 * Reconcile a delta into the local database in one atomic transaction.
 *
 * Last-write-wins per entity on `updated_at`; tombstones delete only rows whose
 * last change is not newer than the deletion; rows pointing at missing
 * categories are skipped instead of violating foreign keys. Applying the same
 * delta twice leaves the database unchanged.
 */
export async function applySyncDelta(
  db: SQLiteDatabaseLike,
  delta: KyrosSyncDeltaV1
): Promise<SyncReconciliationResult> {
  if (!delta || typeof delta !== 'object') {
    throw new Error('Invalid sync delta: expected an object.');
  }
  if (delta.version !== 1) {
    throw new Error(
      `Unsupported sync delta version: ${String((delta as { version?: unknown }).version)}.`
    );
  }
  const changes = delta.changes;
  if (!changes || typeof changes !== 'object') {
    throw new Error('Invalid sync delta: missing changes.');
  }
  for (const key of ['transactions', 'categories', 'budgets', 'goals', 'recurring'] as const) {
    if (!Array.isArray(changes[key])) {
      throw new Error(`Invalid sync delta: changes.${key} must be an array.`);
    }
  }
  if (!Array.isArray(delta.tombstones)) {
    throw new Error('Invalid sync delta: tombstones must be an array.');
  }

  const storage = createSyncStorage(db);
  await storage.initialize();

  const result: SyncReconciliationResult = {
    transactions: emptyCounts(),
    categories: emptyCounts(),
    budgets: emptyCounts(),
    goals: emptyCounts(),
    recurring: emptyCounts(),
    tombstonesApplied: 0,
  };

  await withAtomicTransaction(db, async () => {
    const countsByType: Record<TombstoneEntityType, SyncEntityCounts> = {
      transaction: result.transactions,
      category: result.categories,
      budget: result.budgets,
      goal: result.goals,
      recurring: result.recurring,
    };

    // Deletions first so entities removed in the same delta cannot leave
    // dangling foreign keys behind.
    for (const entityType of TOMBSTONE_DELETE_ORDER) {
      const counts = countsByType[entityType];
      const tombstones: TombstoneRecord[] = delta.tombstones.filter(
        (t) => t && t.entityType === entityType
      );
      for (const tombstone of tombstones) {
        if (!isPositiveInt(tombstone.entityId)) {
          counts.skipped += 1;
          continue;
        }
        const deletedAt = toEpochMs(tombstone.deletedAt);
        if (deletedAt <= 0) {
          counts.skipped += 1;
          continue;
        }
        const before = counts.deleted;
        await deleteEntity(db, storage, entityType, tombstone.entityId, deletedAt, counts);
        if (counts.deleted > before) {
          result.tombstonesApplied += 1;
        }
      }
    }

    // Categories before children so foreign keys resolve.
    for (const category of changes.categories) {
      await applyCategory(db, storage, category, result.categories);
    }
    for (const goal of changes.goals) {
      await applyGoal(db, storage, goal, result.goals);
    }
    for (const recurring of changes.recurring) {
      await applyRecurring(db, storage, recurring, result.recurring);
    }
    for (const transaction of changes.transactions) {
      await applyTransaction(db, storage, transaction, result.transactions);
    }
    for (const budget of changes.budgets) {
      await applyBudget(db, storage, budget, result.budgets);
    }
  });

  return result;
}
