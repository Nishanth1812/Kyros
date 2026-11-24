import { initializeSchema } from './schema';
import {
  Budget,
  BudgetStorage,
  BudgetValidationError,
  BudgetValidationErrorEntry,
  NewBudgetInput,
  SQLiteDatabaseLike,
  TransactionType,
} from './types';
import { MAX_AMOUNT_MINOR_UNITS } from './validation';
import { createSyncStorage, withAtomicTransaction } from './syncStorage';

interface BudgetRow {
  id: number;
  category_id: number | null;
  amount_minor: number;
}

function rowToBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    categoryId: row.category_id,
    amountMinor: row.amount_minor,
  };
}

/**
 * Validate the raw budget input. Existence and type of the category need a
 * database lookup and are checked by the storage boundary.
 */
function assertValidBudgetInput(input: NewBudgetInput): {
  categoryId: number | null;
  amountMinor: number;
} {
  const errors: BudgetValidationErrorEntry[] = [];

  const amount = input.amountMinor;
  let amountMinor: number | undefined;
  if (amount === undefined || amount === null || amount === '') {
    errors.push({ field: 'amountMinor', message: 'Amount is required.' });
  } else if (typeof amount === 'string') {
    errors.push({
      field: 'amountMinor',
      message: 'Amount must be an integer number of minor units.',
    });
  } else if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    errors.push({
      field: 'amountMinor',
      message: 'Amount must be a valid integer number of minor units.',
    });
  } else if (!Number.isInteger(amount)) {
    errors.push({
      field: 'amountMinor',
      message: 'Amount must be an integer number of minor units (no decimals).',
    });
  } else if (amount === 0) {
    errors.push({ field: 'amountMinor', message: 'Amount must be greater than zero.' });
  } else if (amount < 0) {
    errors.push({ field: 'amountMinor', message: 'Amount must not be negative.' });
  } else if (amount > MAX_AMOUNT_MINOR_UNITS) {
    errors.push({
      field: 'amountMinor',
      message: 'Amount is excessively large.',
    });
  } else {
    amountMinor = amount;
  }

  let categoryId: number | null = null;
  if (input.categoryId !== undefined && input.categoryId !== null) {
    if (!Number.isInteger(input.categoryId) || (input.categoryId as number) <= 0) {
      errors.push({
        field: 'categoryId',
        message: 'Category must be a positive integer or omitted.',
      });
    } else {
      categoryId = input.categoryId as number;
    }
  }

  if (errors.length > 0 || amountMinor === undefined) {
    throw new BudgetValidationError(errors);
  }

  return { categoryId, amountMinor };
}

async function assertExpenseCategory(
  db: SQLiteDatabaseLike,
  categoryId: number
): Promise<void> {
  const category = await db.getFirstAsync<{ id: number; type: TransactionType }>(
    'SELECT id, type FROM categories WHERE id = ?;',
    categoryId
  );
  if (!category) {
    throw new BudgetValidationError([
      { field: 'categoryId', message: 'Category does not exist.' },
    ]);
  }
  if (category.type !== 'expense') {
    throw new BudgetValidationError([
      {
        field: 'categoryId',
        message: 'Only expense categories can have a budget.',
      },
    ]);
  }
}

export function createBudgetStorage(db: SQLiteDatabaseLike): BudgetStorage {
  const syncStorage = createSyncStorage(db);
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (!initPromise) {
      initPromise = initializeSchema(db)
        .then(() => {
          initialized = true;
        })
        .catch((error) => {
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

    async listBudgets(): Promise<Budget[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<BudgetRow>(
        `SELECT id, category_id, amount_minor
         FROM budgets
         ORDER BY category_id IS NOT NULL ASC, category_id ASC, id ASC;`
      );
      return rows.map(rowToBudget);
    },

    async saveBudget(input: NewBudgetInput): Promise<Budget> {
      await ensureInitialized();

      const { categoryId, amountMinor } = assertValidBudgetInput(input);
      if (categoryId !== null) {
        await assertExpenseCategory(db, categoryId);
      }

      // A select-then-write upsert avoids UPSERT syntax, which older Android
      // SQLite versions do not support. The unique index still guarantees one
      // row per scope.
      const existing = await db.getFirstAsync<{ id: number; updated_at: number }>(
        'SELECT id, updated_at FROM budgets WHERE category_id IS ?;',
        categoryId
      );
      const updatedAt = Math.max(Date.now(), (existing?.updated_at ?? 0) + 1);

      if (existing) {
        await db.runAsync(
          'UPDATE budgets SET amount_minor = ?, updated_at = ? WHERE id = ?;',
          amountMinor,
          updatedAt,
          existing.id
        );
        return { id: existing.id, categoryId, amountMinor };
      }

      const result = await db.runAsync(
        'INSERT INTO budgets (category_id, amount_minor, updated_at) VALUES (?, ?, ?);',
        categoryId,
        amountMinor,
        updatedAt
      );
      return { id: result.lastInsertRowId, categoryId, amountMinor };
    },

    async deleteBudget(id: number): Promise<void> {
      await ensureInitialized();
      if (!Number.isInteger(id) || id <= 0) return;
      await syncStorage.initialize();
      await withAtomicTransaction(db, async () => {
        const existing = await db.getFirstAsync<{ updated_at: number }>(
          'SELECT updated_at FROM budgets WHERE id = ?;',
          id
        );
        if (!existing) return;
        const deletedAt = Math.max(Date.now(), existing.updated_at + 1);
        await syncStorage.recordTombstone('budget', id, deletedAt);
        await db.runAsync('DELETE FROM budgets WHERE id = ?;', id);
      });
    },
  };
}
