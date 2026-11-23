import { validateBackupPayload } from './backupValidation';
import { BUILTIN_CATEGORIES } from './schema';
import {
  BackupBudget,
  BackupCategory,
  BackupTransaction,
  KyrosBackupV1,
  RestoreResult,
  SQLiteDatabaseLike,
} from './types';

interface CategoryRow {
  id: number;
  type: string;
  name: string;
  is_builtin: number;
}

interface TransactionRow {
  id: number;
  type: string;
  amount_minor: number;
  date: string;
  description: string | null;
  created_at: number;
  category_id: number;
}

interface BudgetRow {
  id: number;
  category_id: number | null;
  amount_minor: number;
}

export async function exportBackupData(
  db: SQLiteDatabaseLike,
  appVersion: string = '0.4.0'
): Promise<KyrosBackupV1> {
  const categoryRows = await db.getAllAsync<CategoryRow>(
    'SELECT id, type, name, is_builtin FROM categories ORDER BY id ASC;'
  );
  const categories: BackupCategory[] = categoryRows.map((r) => ({
    id: r.id,
    type: r.type as 'income' | 'expense',
    name: r.name,
    isBuiltin: Boolean(r.is_builtin),
  }));

  const transactionRows = await db.getAllAsync<TransactionRow>(
    'SELECT id, type, amount_minor, date, description, created_at, category_id FROM transactions ORDER BY id ASC;'
  );
  const transactions: BackupTransaction[] = transactionRows.map((r) => ({
    id: r.id,
    type: r.type as 'income' | 'expense',
    amountMinor: r.amount_minor,
    date: r.date,
    description: r.description,
    createdAt: r.created_at,
    categoryId: r.category_id,
  }));

  const budgetRows = await db.getAllAsync<BudgetRow>(
    'SELECT id, category_id, amount_minor FROM budgets ORDER BY id ASC;'
  );
  const budgets: BackupBudget[] = budgetRows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    amountMinor: r.amount_minor,
  }));

  return {
    meta: {
      version: 1,
      appVersion,
      exportedAt: new Date().toISOString(),
    },
    data: {
      categories,
      transactions,
      budgets,
    },
  };
}

export async function restoreBackupData(
  db: SQLiteDatabaseLike,
  rawBackup: unknown
): Promise<RestoreResult> {
  const validated = validateBackupPayload(rawBackup);
  const { categories, transactions, budgets } = validated.data;

  const performRestore = async () => {
    // Foreign keys may be enforced; delete in dependent order
    await db.execAsync('DELETE FROM budgets;');
    await db.execAsync('DELETE FROM transactions;');
    await db.execAsync('DELETE FROM categories;');

    // Insert categories with original IDs to maintain integrity
    for (const cat of categories) {
      await db.runAsync(
        'INSERT INTO categories (id, type, name, is_builtin) VALUES (?, ?, ?, ?);',
        cat.id,
        cat.type,
        cat.name,
        cat.isBuiltin ? 1 : 0
      );
    }

    // Insert transactions
    for (const tx of transactions) {
      await db.runAsync(
        `INSERT INTO transactions (id, type, amount_minor, date, description, created_at, category_id)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        tx.id,
        tx.type,
        tx.amountMinor,
        tx.date,
        tx.description,
        tx.createdAt,
        tx.categoryId
      );
    }

    // Insert budgets
    for (const b of budgets) {
      await db.runAsync(
        'INSERT INTO budgets (id, category_id, amount_minor) VALUES (?, ?, ?);',
        b.id,
        b.categoryId,
        b.amountMinor
      );
    }

    // Ensure all standard built-in categories exist so the app remains fully operable
    for (const { type, name } of BUILTIN_CATEGORIES) {
      await db.runAsync(
        `INSERT INTO categories (type, name, is_builtin)
         SELECT ?, ?, 1
         WHERE NOT EXISTS (
           SELECT 1 FROM categories WHERE type = ? AND name = ?
         );`,
        type,
        name,
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
  };
}
