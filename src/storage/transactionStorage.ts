import { initializeSchema } from './schema';
import {
  NewTransactionInput,
  SQLiteDatabaseLike,
  Transaction,
  TransactionStorage,
  TransactionType,
  TransactionValidationError,
} from './types';
import { assertValidCategoryId, validateTransactionInput } from './validation';
import { createSyncStorage, withAtomicTransaction } from './syncStorage';

interface TransactionRow {
  id: number;
  type: TransactionType;
  amount_minor: number;
  date: string;
  description: string | null;
  created_at: number;
  category_id: number;
  updated_at: number;
}

const TRANSACTION_COLUMNS =
  'id, type, amount_minor, date, description, created_at, category_id, updated_at';

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amount_minor,
    date: row.date,
    description: row.description ?? null,
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * A transaction's category must exist and belong to the same type as the
 * transaction. This is checked before any write so a rejected write cannot
 * mutate the row.
 */
async function assertCategoryMatches(
  db: SQLiteDatabaseLike,
  type: TransactionType,
  categoryId: number
): Promise<void> {
  const category = await db.getFirstAsync<{ id: number; type: TransactionType }>(
    'SELECT id, type FROM categories WHERE id = ?;',
    categoryId
  );
  if (!category) {
    throw new TransactionValidationError([
      { field: 'categoryId', message: 'Category does not exist.' },
    ]);
  }
  if (category.type !== type) {
    throw new TransactionValidationError([
      {
        field: 'categoryId',
        message: 'Category does not match the transaction type.',
      },
    ]);
  }
}

export function createTransactionStorage(db: SQLiteDatabaseLike): TransactionStorage {
  const syncStorage = createSyncStorage(db);
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (!initPromise) {
      initPromise = initializeSchema(db).then(() => {
        initialized = true;
      }).catch((error) => {
        initPromise = null;
        throw error;
      });
    }
    await initPromise;
  }

  async function selectTransaction(id: number): Promise<Transaction | null> {
    if (!Number.isInteger(id) || id <= 0) return null;
    const row = await db.getFirstAsync<TransactionRow>(
      `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = ?;`,
      id
    );
    return row ? rowToTransaction(row) : null;
  }

  return {
    async initialize(): Promise<void> {
      await ensureInitialized();
    },

    async addTransaction(input: NewTransactionInput): Promise<Transaction> {
      await ensureInitialized();

      const validation = validateTransactionInput(input);
      if (!validation.ok || !validation.value) {
        throw new TransactionValidationError(validation.errors);
      }

      const { type, amountMinor, date, description } = validation.value;
      const categoryId = assertValidCategoryId(input.categoryId);
      await assertCategoryMatches(db, type, categoryId);

      const createdAt = Date.now();
      const result = await db.runAsync(
        `INSERT INTO transactions
           (type, amount_minor, date, description, category_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        type,
        amountMinor,
        date,
        description,
        categoryId,
        createdAt,
        createdAt
      );

      return {
        id: result.lastInsertRowId,
        type,
        amountMinor,
        date,
        description,
        categoryId,
        createdAt,
        updatedAt: createdAt,
      };
    },

    async updateTransaction(
      id: number,
      input: NewTransactionInput
    ): Promise<Transaction> {
      await ensureInitialized();

      const validation = validateTransactionInput(input);
      if (!validation.ok || !validation.value) {
        throw new TransactionValidationError(validation.errors);
      }

      const { type, amountMinor, date, description } = validation.value;
      const categoryId = assertValidCategoryId(input.categoryId);
      await assertCategoryMatches(db, type, categoryId);

      const existing = await selectTransaction(id);
      if (!existing) {
        throw new Error(`Transaction ${id} does not exist.`);
      }

      const updatedAt = Math.max(Date.now(), (existing.updatedAt ?? existing.createdAt) + 1);
      await db.runAsync(
        `UPDATE transactions
         SET type = ?, amount_minor = ?, date = ?, description = ?, category_id = ?, updated_at = ?
         WHERE id = ?;`,
        type,
        amountMinor,
        date,
        description,
        categoryId,
        updatedAt,
        id
      );

      // Identity and creation time are immutable; only the displayed fields
      // (including ordering by date) change.
      return {
        id: existing.id,
        type,
        amountMinor,
        date,
        description,
        categoryId,
        createdAt: existing.createdAt,
        updatedAt,
      };
    },

    async deleteTransaction(id: number): Promise<void> {
      await ensureInitialized();
      if (!Number.isInteger(id) || id <= 0) return;
      await syncStorage.initialize();
      await withAtomicTransaction(db, async () => {
        const existing = await selectTransaction(id);
        if (!existing) return;
        const deletedAt = Math.max(Date.now(), (existing.updatedAt ?? existing.createdAt) + 1);
        await syncStorage.recordTombstone('transaction', id, deletedAt);
        await db.runAsync('DELETE FROM transactions WHERE id = ?;', id);
      });
    },

    async listTransactions(): Promise<Transaction[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<TransactionRow>(
        `SELECT ${TRANSACTION_COLUMNS}
         FROM transactions
         ORDER BY date DESC, created_at DESC, id DESC;`
      );
      return rows.map(rowToTransaction);
    },

    async getTransactionById(id: number): Promise<Transaction | null> {
      await ensureInitialized();
      return selectTransaction(id);
    },
  };
}
