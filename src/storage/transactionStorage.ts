import { initializeSchema } from './schema';
import {
  NewTransactionInput,
  SQLiteDatabaseLike,
  Transaction,
  TransactionStorage,
  TransactionValidationError,
} from './types';
import { validateTransactionInput } from './validation';

interface TransactionRow {
  id: number;
  type: 'income' | 'expense';
  amount_minor: number;
  date: string;
  description: string | null;
  created_at: number;
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amount_minor,
    date: row.date,
    description: row.description ?? null,
    createdAt: row.created_at,
  };
}

export function createTransactionStorage(db: SQLiteDatabaseLike): TransactionStorage {
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
      const createdAt = Date.now();

      const result = await db.runAsync(
        `INSERT INTO transactions (type, amount_minor, date, description, created_at)
         VALUES (?, ?, ?, ?, ?);`,
        type,
        amountMinor,
        date,
        description,
        createdAt
      );

      return { id: result.lastInsertRowId, type, amountMinor, date, description, createdAt };
    },

    async listTransactions(): Promise<Transaction[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<TransactionRow>(
        `SELECT id, type, amount_minor, date, description, created_at
         FROM transactions
         ORDER BY date DESC, created_at DESC, id DESC;`
      );
      return rows.map(rowToTransaction);
    },

    async getTransactionById(id: number): Promise<Transaction | null> {
      await ensureInitialized();
      if (!Number.isInteger(id) || id <= 0) return null;
      const row = await db.getFirstAsync<TransactionRow>(
        `SELECT id, type, amount_minor, date, description, created_at
         FROM transactions WHERE id = ?;`,
        id
      );
      return row ? rowToTransaction(row) : null;
    },
  };
}
