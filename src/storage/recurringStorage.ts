import { calculateNextDueDate } from '../lib/recurringEngine';
import { initializeSchema } from './schema';
import {
  NewRecurringInput,
  RecurringFrequency,
  RecurringStorage,
  RecurringTransaction,
  SQLiteDatabaseLike,
  Transaction,
  TransactionType,
} from './types';

interface RecurringRow {
  id: number;
  amount_minor: number;
  type: TransactionType;
  category_id: number;
  description: string | null;
  frequency: RecurringFrequency;
  next_due_date: string;
  is_active: number;
  created_at: number;
  updated_at: number;
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

export function createRecurringStorage(db: SQLiteDatabaseLike): RecurringStorage {
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (!initPromise) {
      initPromise = (async () => {
        await initializeSchema(db);
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

    async listRecurring(): Promise<RecurringTransaction[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<RecurringRow>(
        `SELECT id, amount_minor, type, category_id, description, frequency, next_due_date, is_active, created_at, updated_at
         FROM recurring_transactions
         ORDER BY is_active DESC, next_due_date ASC, id ASC;`
      );
      return rows.map(rowToRecurring);
    },

    async addRecurring(input: NewRecurringInput): Promise<RecurringTransaction> {
      await ensureInitialized();

      const amountMinor = Number(input.amountMinor);
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
        throw new Error('Recurring amount must be a positive integer in minor units (paise).');
      }

      const type = input.type as TransactionType;
      if (type !== 'income' && type !== 'expense') {
        throw new Error(`Invalid recurring transaction type: ${input.type}`);
      }

      const categoryId = Number(input.categoryId);
      const category = await db.getFirstAsync<{ id: number; type: string }>(
        `SELECT id, type FROM categories WHERE id = ?;`,
        categoryId
      );
      if (!category) {
        throw new Error(`Category ${categoryId} does not exist.`);
      }
      if (category.type !== type) {
        throw new Error(`Category ${categoryId} is not of type ${type}.`);
      }

      const frequency = input.frequency as RecurringFrequency;
      if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) {
        throw new Error(`Invalid frequency: ${input.frequency}`);
      }

      const nextDueDate = String(input.nextDueDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
        throw new Error(`Invalid nextDueDate format: ${nextDueDate}`);
      }

      const description = input.description ? String(input.description).trim() : null;
      const isActive = input.isActive !== false;
      const now = Date.now();

      const result = await db.runAsync(
        `INSERT INTO recurring_transactions
           (amount_minor, type, category_id, description, frequency, next_due_date, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        amountMinor,
        type,
        categoryId,
        description,
        frequency,
        nextDueDate,
        isActive ? 1 : 0,
        now,
        now
      );

      return {
        id: result.lastInsertRowId,
        amountMinor,
        type,
        categoryId,
        description,
        frequency,
        nextDueDate,
        isActive,
        createdAt: now,
        updatedAt: now,
      };
    },

    async updateRecurring(id: number, input: Partial<NewRecurringInput>): Promise<RecurringTransaction> {
      await ensureInitialized();

      const existing = await db.getFirstAsync<RecurringRow>(
        `SELECT id, amount_minor, type, category_id, description, frequency, next_due_date, is_active, created_at, updated_at
         FROM recurring_transactions WHERE id = ?;`,
        id
      );
      if (!existing) {
        throw new Error(`Recurring transaction ${id} not found.`);
      }

      let amountMinor = existing.amount_minor;
      if (input.amountMinor !== undefined) {
        amountMinor = Number(input.amountMinor);
        if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
          throw new Error('Recurring amount must be a positive integer in minor units (paise).');
        }
      }

      let categoryId = existing.category_id;
      if (input.categoryId !== undefined) {
        categoryId = Number(input.categoryId);
        const cat = await db.getFirstAsync<{ id: number; type: string }>(
          `SELECT id, type FROM categories WHERE id = ?;`,
          categoryId
        );
        if (!cat || cat.type !== existing.type) {
          throw new Error(`Category ${categoryId} is invalid for type ${existing.type}.`);
        }
      }

      let frequency = existing.frequency;
      if (input.frequency !== undefined) {
        frequency = input.frequency as RecurringFrequency;
        if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) {
          throw new Error(`Invalid frequency: ${input.frequency}`);
        }
      }

      let nextDueDate = existing.next_due_date;
      if (input.nextDueDate !== undefined) {
        nextDueDate = String(input.nextDueDate);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
          throw new Error(`Invalid nextDueDate format: ${nextDueDate}`);
        }
      }

      let description = existing.description;
      if (input.description !== undefined) {
        description = input.description ? String(input.description).trim() : null;
      }

      let isActive = existing.is_active === 1;
      if (input.isActive !== undefined) {
        isActive = input.isActive;
      }

      const now = Date.now();
      await db.runAsync(
        `UPDATE recurring_transactions
         SET amount_minor = ?, category_id = ?, description = ?, frequency = ?, next_due_date = ?, is_active = ?, updated_at = ?
         WHERE id = ?;`,
        amountMinor,
        categoryId,
        description,
        frequency,
        nextDueDate,
        isActive ? 1 : 0,
        now,
        id
      );

      return {
        id,
        amountMinor,
        type: existing.type,
        categoryId,
        description,
        frequency,
        nextDueDate,
        isActive,
        createdAt: existing.created_at,
        updatedAt: now,
      };
    },

    async deleteRecurring(id: number): Promise<void> {
      await ensureInitialized();

      const executeDelete = async () => {
        await db.runAsync(`DELETE FROM recurring_transactions WHERE id = ?;`, id);
        const now = Date.now();
        await db.runAsync(
          `INSERT INTO deleted_tombstones (entity_type, entity_id, deleted_at) VALUES ('recurring', ?, ?);`,
          id,
          now
        );
      };

      if (typeof db.withTransactionAsync === 'function') {
        await db.withTransactionAsync(executeDelete);
      } else {
        await db.execAsync('BEGIN;');
        try {
          await executeDelete();
          await db.execAsync('COMMIT;');
        } catch (err) {
          try {
            await db.execAsync('ROLLBACK;');
          } catch {
            // ignore
          }
          throw err;
        }
      }
    },

    async toggleRecurringActive(id: number, isActive: boolean): Promise<RecurringTransaction> {
      return this.updateRecurring(id, { isActive });
    },

    async applyRecurring(
      id: number,
      asOfDate?: string
    ): Promise<{ transaction: Transaction; nextDueDate: string }> {
      await ensureInitialized();

      const schedule = await db.getFirstAsync<RecurringRow>(
        `SELECT id, amount_minor, type, category_id, description, frequency, next_due_date, is_active, created_at, updated_at
         FROM recurring_transactions WHERE id = ?;`,
        id
      );
      if (!schedule) {
        throw new Error(`Recurring schedule ${id} not found.`);
      }

      const applyDate = asOfDate || schedule.next_due_date;
      const nextDue = calculateNextDueDate(schedule.next_due_date, schedule.frequency);
      const now = Date.now();

      let createdTx: Transaction | null = null;

      const executeApply = async () => {
        // 1. Insert into transactions
        const txResult = await db.runAsync(
          `INSERT INTO transactions (type, amount_minor, date, description, created_at, category_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          schedule.type,
          schedule.amount_minor,
          applyDate,
          schedule.description,
          now,
          schedule.category_id,
          now
        );

        createdTx = {
          id: txResult.lastInsertRowId,
          type: schedule.type,
          amountMinor: schedule.amount_minor,
          date: applyDate,
          description: schedule.description,
          categoryId: schedule.category_id,
          createdAt: now,
          updatedAt: now,
        };

        // 2. Advance schedule nextDueDate
        await db.runAsync(
          `UPDATE recurring_transactions
           SET next_due_date = ?, updated_at = ?
           WHERE id = ?;`,
          nextDue,
          now,
          id
        );
      };

      if (typeof db.withTransactionAsync === 'function') {
        await db.withTransactionAsync(executeApply);
      } else {
        await db.execAsync('BEGIN;');
        try {
          await executeApply();
          await db.execAsync('COMMIT;');
        } catch (err) {
          try {
            await db.execAsync('ROLLBACK;');
          } catch {
            // ignore
          }
          throw err;
        }
      }

      return {
        transaction: createdTx!,
        nextDueDate: nextDue,
      };
    },
  };
}
