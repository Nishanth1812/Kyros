import { initializeSchema } from './schema';
import {
  Category,
  CategoryStorage,
  CategoryValidationError,
  NewCategoryInput,
  SQLiteDatabaseLike,
  TransactionType,
} from './types';
import { assertValidCategoryInput } from './validation';

interface CategoryRow {
  id: number;
  type: TransactionType;
  name: string;
  is_builtin: number;
  is_archived: number;
  updated_at?: number;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    isBuiltin: row.is_builtin === 1,
    isArchived: row.is_archived === 1,
    updatedAt: row.updated_at,
  };
}

/**
 * Backs the case-insensitive per-type uniqueness rule with a SQLite constraint,
 * so it holds even for writes that bypass application validation.
 */
const CREATE_CATEGORY_UNIQUE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_type_name_nocase
ON categories (type, name COLLATE NOCASE);
`;

export function createCategoryStorage(db: SQLiteDatabaseLike): CategoryStorage {
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (!initPromise) {
      initPromise = (async () => {
        await initializeSchema(db);
        await db.execAsync(CREATE_CATEGORY_UNIQUE_INDEX_SQL);
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

    async listCategories(type?: TransactionType, includeArchived: boolean = false): Promise<Category[]> {
      await ensureInitialized();
      const whereClauses: string[] = [];
      const params: (string | number)[] = [];

      if (type !== undefined) {
        whereClauses.push('type = ?');
        params.push(type);
      }
      if (!includeArchived) {
        whereClauses.push('is_archived = 0');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const sql = `
        SELECT id, type, name, is_builtin, is_archived, updated_at
        FROM categories
        ${whereSql}
        ORDER BY is_builtin DESC, name COLLATE NOCASE ASC, id ASC;
      `;

      const rows = await db.getAllAsync<CategoryRow>(sql, ...params);
      return rows.map(rowToCategory);
    },

    async createCategory(input: NewCategoryInput): Promise<Category> {
      await ensureInitialized();
      const { type, name } = assertValidCategoryInput(input);

      const duplicate = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM categories WHERE type = ? AND name = ? COLLATE NOCASE LIMIT 1;`,
        type,
        name
      );
      if (duplicate) {
        throw new CategoryValidationError([
          {
            field: 'name',
            message: 'A category with this name already exists for this type.',
          },
        ]);
      }

      const now = Date.now();
      const result = await db.runAsync(
        `INSERT INTO categories (type, name, is_builtin, is_archived, updated_at) VALUES (?, ?, 0, 0, ?);`,
        type,
        name,
        now
      );
      return { id: result.lastInsertRowId, type, name, isBuiltin: false, isArchived: false, updatedAt: now };
    },

    async renameCategory(id: number, newName: string): Promise<Category> {
      await ensureInitialized();

      const existing = await db.getFirstAsync<CategoryRow>(
        `SELECT id, type, name, is_builtin, is_archived, updated_at FROM categories WHERE id = ?;`,
        id
      );
      if (!existing) {
        throw new Error(`Category ${id} not found.`);
      }

      const { name: validatedName } = assertValidCategoryInput({ type: existing.type, name: newName });

      const duplicate = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM categories WHERE type = ? AND name = ? COLLATE NOCASE AND id != ? LIMIT 1;`,
        existing.type,
        validatedName,
        id
      );
      if (duplicate) {
        throw new CategoryValidationError([
          {
            field: 'name',
            message: 'A category with this name already exists for this type.',
          },
        ]);
      }

      const now = Date.now();
      await db.runAsync(
        `UPDATE categories SET name = ?, updated_at = ? WHERE id = ?;`,
        validatedName,
        now,
        id
      );

      return {
        id,
        type: existing.type,
        name: validatedName,
        isBuiltin: existing.is_builtin === 1,
        isArchived: existing.is_archived === 1,
        updatedAt: now,
      };
    },

    async archiveCategory(id: number, isArchived: boolean): Promise<Category> {
      await ensureInitialized();

      const existing = await db.getFirstAsync<CategoryRow>(
        `SELECT id, type, name, is_builtin, is_archived, updated_at FROM categories WHERE id = ?;`,
        id
      );
      if (!existing) {
        throw new Error(`Category ${id} not found.`);
      }
      if (existing.is_builtin === 1 && isArchived) {
        throw new CategoryValidationError([
          { field: 'name', message: 'Built-in categories cannot be archived.' },
        ]);
      }

      const now = Date.now();
      await db.runAsync(
        `UPDATE categories SET is_archived = ?, updated_at = ? WHERE id = ?;`,
        isArchived ? 1 : 0,
        now,
        id
      );

      return {
        id,
        type: existing.type,
        name: existing.name,
        isBuiltin: existing.is_builtin === 1,
        isArchived,
        updatedAt: now,
      };
    },

    async deleteCategoryWithReassignment(
      idToDelete: number,
      targetCategoryId: number
    ): Promise<{ reassignedCount: number }> {
      await ensureInitialized();

      if (idToDelete === targetCategoryId) {
        throw new Error('Cannot reassign to the category being deleted.');
      }

      const source = await db.getFirstAsync<CategoryRow>(
        `SELECT id, type, name, is_builtin, is_archived FROM categories WHERE id = ?;`,
        idToDelete
      );
      if (!source) {
        throw new Error(`Category to delete (${idToDelete}) not found.`);
      }

      const target = await db.getFirstAsync<CategoryRow>(
        `SELECT id, type, name, is_builtin, is_archived FROM categories WHERE id = ?;`,
        targetCategoryId
      );
      if (!target) {
        throw new Error(`Target category (${targetCategoryId}) not found.`);
      }
      if (target.type !== source.type) {
        throw new Error(`Cannot reassign to a category of different type (${target.type} vs ${source.type}).`);
      }
      if (target.is_archived === 1) {
        throw new Error('Cannot reassign to an archived category.');
      }

      const now = Date.now();

      const executeDeletion = async () => {
        // Reassign all transactions
        const txResult = await db.runAsync(
          `UPDATE transactions SET category_id = ?, updated_at = ? WHERE category_id = ?;`,
          targetCategoryId,
          now,
          idToDelete
        );

        // Preserve recurring schedules by moving them with their transactions.
        await db.runAsync(
          `UPDATE recurring_transactions SET category_id = ?, updated_at = ? WHERE category_id = ?;`,
          targetCategoryId,
          now,
          idToDelete
        );

        // Record removed budgets so sync peers can apply the same deletion.
        await db.runAsync(
          `INSERT INTO deleted_tombstones (entity_type, entity_id, deleted_at)
           SELECT 'budget', id, ? FROM budgets WHERE category_id = ?;`,
          now,
          idToDelete
        );
        await db.runAsync(`DELETE FROM budgets WHERE category_id = ?;`, idToDelete);

        // Delete the category
        await db.runAsync(`DELETE FROM categories WHERE id = ?;`, idToDelete);

        // Log tombstone
        await db.runAsync(
          `INSERT INTO deleted_tombstones (entity_type, entity_id, deleted_at) VALUES ('category', ?, ?);`,
          idToDelete,
          now
        );

        return { reassignedCount: txResult.changes };
      };

      if (typeof db.withTransactionAsync === 'function') {
        let result = { reassignedCount: 0 };
        await db.withTransactionAsync(async () => {
          result = await executeDeletion();
        });
        return result;
      } else {
        await db.execAsync('BEGIN;');
        try {
          const result = await executeDeletion();
          await db.execAsync('COMMIT;');
          return result;
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
  };
}
