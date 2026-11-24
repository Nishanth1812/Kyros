import { initializeSchema } from './schema';
import {
  FinancialGoal,
  GoalStorage,
  NewGoalInput,
  SQLiteDatabaseLike,
} from './types';

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

export function createGoalStorage(db: SQLiteDatabaseLike): GoalStorage {
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

    async listGoals(): Promise<FinancialGoal[]> {
      await ensureInitialized();
      const rows = await db.getAllAsync<GoalRow>(
        `SELECT id, title, target_amount_minor, current_saved_minor, target_date, status, created_at, updated_at
         FROM financial_goals
         ORDER BY CASE status WHEN 'active' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, target_date ASC, id ASC;`
      );
      return rows.map(rowToGoal);
    },

    async addGoal(input: NewGoalInput): Promise<FinancialGoal> {
      await ensureInitialized();

      const title = String(input.title || '').trim();
      if (!title || title.length > 60) {
        throw new Error('Goal title must be non-empty and up to 60 characters.');
      }

      const targetAmountMinor = Number(input.targetAmountMinor);
      if (!Number.isSafeInteger(targetAmountMinor) || targetAmountMinor <= 0) {
        throw new Error('Target amount must be a positive integer in minor units (paise).');
      }

      const currentSavedMinor = input.currentSavedMinor !== undefined ? Number(input.currentSavedMinor) : 0;
      if (!Number.isSafeInteger(currentSavedMinor) || currentSavedMinor < 0) {
        throw new Error('Current saved amount must be a non-negative integer in minor units (paise).');
      }

      const targetDate = input.targetDate ? String(input.targetDate).trim() : null;
      if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        throw new Error(`Invalid target date format: ${targetDate}`);
      }

      const status = (input.status || (currentSavedMinor >= targetAmountMinor ? 'completed' : 'active')) as
        | 'active'
        | 'completed'
        | 'cancelled';

      const now = Date.now();
      const result = await db.runAsync(
        `INSERT INTO financial_goals
           (title, target_amount_minor, current_saved_minor, target_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        title,
        targetAmountMinor,
        currentSavedMinor,
        targetDate,
        status,
        now,
        now
      );

      return {
        id: result.lastInsertRowId,
        title,
        targetAmountMinor,
        currentSavedMinor,
        targetDate,
        status,
        createdAt: now,
        updatedAt: now,
      };
    },

    async updateGoal(id: number, input: Partial<NewGoalInput>): Promise<FinancialGoal> {
      await ensureInitialized();

      const existing = await db.getFirstAsync<GoalRow>(
        `SELECT id, title, target_amount_minor, current_saved_minor, target_date, status, created_at, updated_at
         FROM financial_goals WHERE id = ?;`,
        id
      );
      if (!existing) {
        throw new Error(`Financial goal ${id} not found.`);
      }

      let title = existing.title;
      if (input.title !== undefined) {
        title = String(input.title).trim();
        if (!title || title.length > 60) {
          throw new Error('Goal title must be non-empty and up to 60 characters.');
        }
      }

      let targetAmountMinor = existing.target_amount_minor;
      if (input.targetAmountMinor !== undefined) {
        targetAmountMinor = Number(input.targetAmountMinor);
        if (!Number.isSafeInteger(targetAmountMinor) || targetAmountMinor <= 0) {
          throw new Error('Target amount must be a positive integer in minor units (paise).');
        }
      }

      let currentSavedMinor = existing.current_saved_minor;
      if (input.currentSavedMinor !== undefined) {
        currentSavedMinor = Number(input.currentSavedMinor);
        if (!Number.isSafeInteger(currentSavedMinor) || currentSavedMinor < 0) {
          throw new Error('Current saved amount must be a non-negative integer in minor units (paise).');
        }
      }

      let targetDate = existing.target_date;
      if (input.targetDate !== undefined) {
        targetDate = input.targetDate ? String(input.targetDate).trim() : null;
        if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
          throw new Error(`Invalid target date format: ${targetDate}`);
        }
      }

      let status = existing.status;
      if (input.status !== undefined) {
        status = input.status;
      } else if (currentSavedMinor >= targetAmountMinor) {
        status = 'completed';
      } else if (status === 'completed' && currentSavedMinor < targetAmountMinor) {
        status = 'active';
      }

      const now = Date.now();
      await db.runAsync(
        `UPDATE financial_goals
         SET title = ?, target_amount_minor = ?, current_saved_minor = ?, target_date = ?, status = ?, updated_at = ?
         WHERE id = ?;`,
        title,
        targetAmountMinor,
        currentSavedMinor,
        targetDate,
        status,
        now,
        id
      );

      return {
        id,
        title,
        targetAmountMinor,
        currentSavedMinor,
        targetDate,
        status,
        createdAt: existing.created_at,
        updatedAt: now,
      };
    },

    async deleteGoal(id: number): Promise<void> {
      await ensureInitialized();

      const executeDelete = async () => {
        await db.runAsync(`DELETE FROM financial_goals WHERE id = ?;`, id);
        const now = Date.now();
        await db.runAsync(
          `INSERT INTO deleted_tombstones (entity_type, entity_id, deleted_at) VALUES ('goal', ?, ?);`,
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

    async contributeToGoal(id: number, deltaMinor: number): Promise<FinancialGoal> {
      await ensureInitialized();
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error('Financial goal ID must be a positive safe integer.');
      }
      if (!Number.isSafeInteger(deltaMinor)) {
        throw new Error('Contribution must be an integer number of paise.');
      }

      const now = Date.now();
      const result = await db.runAsync(
        `UPDATE financial_goals
         SET current_saved_minor = MAX(0, current_saved_minor + ?),
             status = CASE
               WHEN MAX(0, current_saved_minor + ?) >= target_amount_minor THEN 'completed'
               WHEN status = 'completed' THEN 'active'
               ELSE status
             END,
             updated_at = ?
         WHERE id = ?
           AND (? <= 0 OR current_saved_minor <= 9007199254740991 - ?);`,
        deltaMinor,
        deltaMinor,
        now,
        id,
        deltaMinor,
        deltaMinor
      );

      if (result.changes === 0) {
        const existing = await db.getFirstAsync<GoalRow>(
          `SELECT id, title, target_amount_minor, current_saved_minor, target_date, status, created_at, updated_at
           FROM financial_goals WHERE id = ?;`,
          id
        );
        if (!existing) throw new Error(`Financial goal ${id} not found.`);
        throw new RangeError('Contribution would exceed the safe integer range for paise.');
      }

      const updated = await db.getFirstAsync<GoalRow>(
        `SELECT id, title, target_amount_minor, current_saved_minor, target_date, status, created_at, updated_at
         FROM financial_goals WHERE id = ?;`,
        id
      );
      if (!updated) throw new Error(`Financial goal ${id} not found.`);
      return rowToGoal(updated);
    },
  };
}
