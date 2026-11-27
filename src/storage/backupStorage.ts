import packageJson from '../../package.json';
import { validateBackupPayload } from './backupValidation';
import { BUILTIN_CATEGORIES } from './schema';
import {
  BackupBudgetV2,
  BackupCategoryV2,
  BackupGoal,
  BackupRecurring,
  BackupTombstone,
  BackupTransactionV2,
  KyrosBackupV2,
  RestoreResult,
  SQLiteDatabaseLike,
  TransactionType,
} from './types';

interface CategoryRow {
  id: number;
  type: TransactionType;
  name: string;
  is_builtin: number;
  is_archived: number | null;
  updated_at: number | null;
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
  frequency: BackupRecurring['frequency'];
  next_due_date: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface TombstoneRow {
  id: number;
  entity_type: BackupTombstone['entityType'];
  entity_id: number;
  deleted_at: number;
}

function effectiveTimestamp(updatedAt: number | null, createdAt: number): number {
  const updated = typeof updatedAt === 'number' ? Math.trunc(updatedAt) : 0;
  return updated > 0 ? updated : Math.trunc(createdAt);
}

/** Export every synchronized table as a `KyrosBackupV2` payload. */
export async function exportBackupData(
  db: SQLiteDatabaseLike,
  appVersion: string = packageJson.version
): Promise<KyrosBackupV2> {
  const categoryRows = await db.getAllAsync<CategoryRow>(
    'SELECT id, type, name, is_builtin, is_archived, updated_at FROM categories ORDER BY id ASC;'
  );
  const categories: BackupCategoryV2[] = categoryRows.map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    isBuiltin: r.is_builtin === 1,
    isArchived: r.is_archived === 1,
    updatedAt: effectiveTimestamp(r.updated_at, 0),
  }));

  const transactionRows = await db.getAllAsync<TransactionRow>(
    `SELECT id, type, amount_minor, date, description, created_at, category_id, updated_at
     FROM transactions ORDER BY id ASC;`
  );
  const transactions: BackupTransactionV2[] = transactionRows.map((r) => ({
    id: r.id,
    type: r.type,
    amountMinor: r.amount_minor,
    date: r.date,
    description: r.description,
    createdAt: r.created_at,
    categoryId: r.category_id,
    updatedAt: effectiveTimestamp(r.updated_at, r.created_at),
  }));

  const budgetRows = await db.getAllAsync<BudgetRow>(
    'SELECT id, category_id, amount_minor, updated_at FROM budgets ORDER BY id ASC;'
  );
  const budgets: BackupBudgetV2[] = budgetRows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    amountMinor: r.amount_minor,
    updatedAt: effectiveTimestamp(r.updated_at, 0),
  }));

  const recurringRows = await db.getAllAsync<RecurringRow>(
    `SELECT id, amount_minor, type, category_id, description, frequency, next_due_date,
            is_active, created_at, updated_at
     FROM recurring_transactions ORDER BY id ASC;`
  );
  const recurring: BackupRecurring[] = recurringRows.map((r) => ({
    id: r.id,
    amountMinor: r.amount_minor,
    type: r.type,
    categoryId: r.category_id,
    description: r.description,
    frequency: r.frequency,
    nextDueDate: r.next_due_date,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const goalRows = await db.getAllAsync<GoalRow>(
    `SELECT id, title, target_amount_minor, current_saved_minor, target_date, status,
            created_at, updated_at
     FROM financial_goals ORDER BY id ASC;`
  );
  const goals: BackupGoal[] = goalRows.map((r) => ({
    id: r.id,
    title: r.title,
    targetAmountMinor: r.target_amount_minor,
    currentSavedMinor: r.current_saved_minor,
    targetDate: r.target_date,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const tombstoneRows = await db.getAllAsync<TombstoneRow>(
    'SELECT id, entity_type, entity_id, deleted_at FROM deleted_tombstones ORDER BY id ASC;'
  );
  const tombstones: BackupTombstone[] = tombstoneRows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    deletedAt: r.deleted_at,
  }));

  return {
    meta: {
      version: 2,
      appVersion,
      exportedAt: new Date().toISOString(),
    },
    data: {
      categories,
      transactions,
      budgets,
      recurring,
      goals,
      tombstones,
    },
  };
}

/**
 * Replace the local database with a V1 or V2 backup. The whole replacement is
 * one transaction, so a failure leaves the previous data untouched.
 */
export async function restoreBackupData(
  db: SQLiteDatabaseLike,
  rawBackup: unknown
): Promise<RestoreResult> {
  const validated = validateBackupPayload(rawBackup);
  const { categories, transactions, budgets, recurring, goals, tombstones } = validated.data;
  const now = Date.now();

  const performRestore = async () => {
    // Delete in dependent order so foreign keys stay valid.
    await db.execAsync('DELETE FROM deleted_tombstones;');
    await db.execAsync('DELETE FROM budgets;');
    await db.execAsync('DELETE FROM transactions;');
    await db.execAsync('DELETE FROM recurring_transactions;');
    await db.execAsync('DELETE FROM financial_goals;');
    await db.execAsync('DELETE FROM categories;');

    // Insert categories with original IDs to maintain integrity.
    for (const cat of categories) {
      await db.runAsync(
        `INSERT INTO categories (id, type, name, is_builtin, is_archived, updated_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        cat.id,
        cat.type,
        cat.name,
        cat.isBuiltin ? 1 : 0,
        cat.isArchived ? 1 : 0,
        cat.updatedAt > 0 ? cat.updatedAt : now
      );
    }

    for (const tx of transactions) {
      await db.runAsync(
        `INSERT INTO transactions
           (id, type, amount_minor, date, description, created_at, category_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        tx.id,
        tx.type,
        tx.amountMinor,
        tx.date,
        tx.description,
        tx.createdAt,
        tx.categoryId,
        tx.updatedAt
      );
    }

    for (const b of budgets) {
      await db.runAsync(
        'INSERT INTO budgets (id, category_id, amount_minor, updated_at) VALUES (?, ?, ?, ?);',
        b.id,
        b.categoryId,
        b.amountMinor,
        b.updatedAt > 0 ? b.updatedAt : now
      );
    }

    for (const rec of recurring) {
      await db.runAsync(
        `INSERT INTO recurring_transactions
           (id, amount_minor, type, category_id, description, frequency, next_due_date,
            is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        rec.id,
        rec.amountMinor,
        rec.type,
        rec.categoryId,
        rec.description,
        rec.frequency,
        rec.nextDueDate,
        rec.isActive ? 1 : 0,
        rec.createdAt,
        rec.updatedAt
      );
    }

    for (const goal of goals) {
      await db.runAsync(
        `INSERT INTO financial_goals
           (id, title, target_amount_minor, current_saved_minor, target_date, status,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        goal.id,
        goal.title,
        goal.targetAmountMinor,
        goal.currentSavedMinor,
        goal.targetDate,
        goal.status,
        goal.createdAt,
        goal.updatedAt
      );
    }

    for (const tombstone of tombstones) {
      await db.runAsync(
        'INSERT INTO deleted_tombstones (id, entity_type, entity_id, deleted_at) VALUES (?, ?, ?, ?);',
        tombstone.id,
        tombstone.entityType,
        tombstone.entityId,
        tombstone.deletedAt
      );
    }

    // Ensure all standard built-in categories exist so the app remains fully
    // operable even when the backup predates them.
    for (const { type, name } of BUILTIN_CATEGORIES) {
      await db.runAsync(
        `INSERT INTO categories (type, name, is_builtin, is_archived, updated_at)
         SELECT ?, ?, 1, 0, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM categories WHERE type = ? AND name = ? COLLATE NOCASE
         );`,
        type,
        name,
        now,
        type,
        name
      );
    }
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(performRestore);
  } else {
    await db.execAsync('BEGIN;');
    try {
      await performRestore();
      await db.execAsync('COMMIT;');
    } catch (err) {
      try {
        await db.execAsync('ROLLBACK;');
      } catch {
        // ignore rollback errors
      }
      throw err;
    }
  }

  return {
    categoriesCount: categories.length,
    transactionsCount: transactions.length,
    budgetsCount: budgets.length,
    recurringCount: recurring.length,
    goalsCount: goals.length,
    tombstonesCount: tombstones.length,
  };
}
