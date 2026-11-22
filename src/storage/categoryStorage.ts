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
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    isBuiltin: row.is_builtin === 1,
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

  const listSql = (filtered: boolean) => `
    SELECT id, type, name, is_builtin
    FROM categories
    ${filtered ? 'WHERE type = ?' : ''}
    ORDER BY is_builtin DESC, name COLLATE NOCASE ASC, id ASC;
  `;

  return {
    async initialize(): Promise<void> {
      await ensureInitialized();
    },

    async listCategories(type?: TransactionType): Promise<Category[]> {
      await ensureInitialized();
      const rows =
        type === undefined
          ? await db.getAllAsync<CategoryRow>(listSql(false))
          : await db.getAllAsync<CategoryRow>(listSql(true), type);
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

      const result = await db.runAsync(
        `INSERT INTO categories (type, name, is_builtin) VALUES (?, ?, 0);`,
        type,
        name
      );
      return { id: result.lastInsertRowId, type, name, isBuiltin: false };
    },
  };
}
