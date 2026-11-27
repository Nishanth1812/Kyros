import { describe, expect, test } from 'bun:test';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';
import { initializeSchema, SCHEMA_VERSION } from '../src/storage/schema';
import { createCategoryStorage } from '../src/storage/categoryStorage';
import { CategoryValidationError } from '../src/storage/types';

const V3_SCHEMA_SQL = `
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    name TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1))
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
    date TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id)
  );
  CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES categories(id),
    amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
    CHECK (category_id IS NULL OR category_id > 0)
  );
  INSERT INTO categories (id, type, name, is_builtin) VALUES
    (1, 'expense', 'Food', 1),
    (2, 'expense', 'Custom dining', 0),
    (3, 'income', 'Salary', 1);
  INSERT INTO transactions (id, type, amount_minor, date, description, created_at, category_id) VALUES
    (101, 'expense', 1500, '2026-02-01', 'Lunch', 1000, 2),
    (102, 'expense', 2200, '2026-02-02', 'Dinner', 2000, 2);
  INSERT INTO budgets (id, category_id, amount_minor) VALUES
    (1, 2, 50000);
  PRAGMA user_version = 3;
`;

describe('Category Management and Schema v4', () => {
  test('test_schema_v3_to_v4_migration_preserves_all_data_and_sets_timestamps', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      await db.execAsync(V3_SCHEMA_SQL);
      await initializeSchema(db);

      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(4);

      // Verify categories updated
      const categories = await db.getAllAsync<{ id: number; name: string; is_archived: number; updated_at: number }>(
        'SELECT id, name, is_archived, updated_at FROM categories ORDER BY id;'
      );
      expect(categories).toHaveLength(3);
      expect(categories[1].name).toBe('Custom dining');
      expect(categories[1].is_archived).toBe(0);
      expect(categories[1].updated_at).toBeGreaterThan(0);

      // Verify transactions preserved and updated_at seeded
      const transactions = await db.getAllAsync<{ id: number; category_id: number; updated_at: number }>(
        'SELECT id, category_id, updated_at FROM transactions ORDER BY id;'
      );
      expect(transactions).toHaveLength(2);
      expect(transactions[0].category_id).toBe(2);
      expect(transactions[0].updated_at).toBe(1000);

      // Verify new tables created
      const recurring = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_transactions';"
      );
      expect(recurring).toHaveLength(1);

      const goals = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='financial_goals';"
      );
      expect(goals).toHaveLength(1);

      const tombstones = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='deleted_tombstones';"
      );
      expect(tombstones).toHaveLength(1);
    } finally {
      close();
    }
  });

  test('test_v4_migration_rolls_back_atomically_on_failure', async () => {
    const injected = new Error('Injected failure during v3->v4 migration');
    const { db, close } = createBunSqliteAdapter(':memory:', {
      failBeforeCommit: injected,
    });
    try {
      await db.execAsync(V3_SCHEMA_SQL);
      await expect(initializeSchema(db)).rejects.toThrow(injected);

      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(version?.user_version).toBe(3);

      const tombstones = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='deleted_tombstones';"
      );
      expect(tombstones).toHaveLength(0);
    } finally {
      close();
    }
  });

  test('test_rename_category_updates_name_and_timestamp_and_enforces_uniqueness', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createCategoryStorage(db);
    try {
      await storage.initialize();
      const created = await storage.createCategory({ type: 'expense', name: 'Coffee' });
      expect(created.name).toBe('Coffee');

      const renamed = await storage.renameCategory(created.id, 'Specialty Coffee');
      expect(renamed.name).toBe('Specialty Coffee');
      expect(renamed.id).toBe(created.id);
      expect(renamed.isBuiltin).toBe(false);

      // Unique name collision check
      await storage.createCategory({ type: 'expense', name: 'Snacks' });
      await expect(storage.renameCategory(created.id, 'snacks')).rejects.toThrow(CategoryValidationError);
    } finally {
      close();
    }
  });

  test('renames built-in categories and rejects blank names', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createCategoryStorage(db);
    try {
      await storage.initialize();
      const categories = await storage.listCategories('expense');
      const food = categories.find((c) => c.name === 'Food' && c.isBuiltin);
      expect(food).toBeDefined();

      const renamed = await storage.renameCategory(food!.id, 'Groceries');
      expect(renamed.name).toBe('Groceries');
      expect(renamed.isBuiltin).toBe(true);
      const custom = await storage.createCategory({ type: 'expense', name: 'Gym' });
      await expect(storage.renameCategory(custom.id, '   ')).rejects.toThrow(CategoryValidationError);
    } finally {
      close();
    }
  });

  test('test_archive_category_toggles_flag_and_excludes_from_active_list', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createCategoryStorage(db);
    try {
      await storage.initialize();
      const custom = await storage.createCategory({ type: 'expense', name: 'Subscriptions' });

      // Active listing includes it
      let active = await storage.listCategories('expense');
      expect(active.some((c) => c.id === custom.id)).toBe(true);

      // Archive it
      const archived = await storage.archiveCategory(custom.id, true);
      expect(archived.isArchived).toBe(true);

      // Active listing hides it by default
      active = await storage.listCategories('expense');
      expect(active.some((c) => c.id === custom.id)).toBe(false);

      // Listing with includeArchived=true returns it
      const all = await storage.listCategories('expense', true);
      expect(all.some((c) => c.id === custom.id)).toBe(true);

      // Unarchive it
      const unarchived = await storage.archiveCategory(custom.id, false);
      expect(unarchived.isArchived).toBe(false);
      active = await storage.listCategories('expense');
      expect(active.some((c) => c.id === custom.id)).toBe(true);

      // Built-in categories cannot be archived
      const builtIn = active.find((c) => c.isBuiltin);
      await expect(storage.archiveCategory(builtIn!.id, true)).rejects.toThrow(/built-in/i);
    } finally {
      close();
    }
  });

  test('test_delete_category_reassigns_transactions_atomically_and_logs_tombstone', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createCategoryStorage(db);
    try {
      await db.execAsync(V3_SCHEMA_SQL);
      await initializeSchema(db);

      // Custom dining (id: 2) has 2 transactions (101, 102) and 1 budget (id: 1)
      // Reassign to Food (id: 1)
      await db.runAsync(
        `INSERT INTO recurring_transactions
          (id, amount_minor, type, category_id, frequency, next_due_date, is_active, created_at, updated_at)
         VALUES (11, 2500, 'expense', 2, 'monthly', '2026-12-01', 1, 1000, 1000);`
      );
      const result = await storage.deleteCategoryWithReassignment(2, 1);
      expect(result.reassignedCount).toBe(2);

      // Category 2 should be gone
      const categories = await storage.listCategories('expense', true);
      expect(categories.some((c) => c.id === 2)).toBe(false);

      // Transactions 101 and 102 should now point to category 1
      const txs = await db.getAllAsync<{ id: number; category_id: number }>(
        'SELECT id, category_id FROM transactions WHERE id IN (101, 102) ORDER BY id;'
      );
      expect(txs[0].category_id).toBe(1);
      expect(txs[1].category_id).toBe(1);

      // Budgets for category 2 should be cleaned up
      const budgets = await db.getAllAsync<{ id: number; category_id: number }>(
        'SELECT id, category_id FROM budgets WHERE category_id = 2;'
      );
      expect(budgets).toHaveLength(0);

      const recurring = await db.getAllAsync<{ category_id: number }>(
        'SELECT category_id FROM recurring_transactions WHERE category_id = 1;'
      );
      expect(recurring).toHaveLength(1);

      // Tombstone should be logged
      const tombstones = await db.getAllAsync<{ entity_type: string; entity_id: number }>(
        'SELECT entity_type, entity_id FROM deleted_tombstones ORDER BY entity_type, entity_id;'
      );
      expect(tombstones).toEqual([
        { entity_type: 'budget', entity_id: 1 },
        { entity_type: 'category', entity_id: 2 },
      ]);
    } finally {
      close();
    }
  });

  test('test_delete_category_rejects_mismatched_type_or_archived_target', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createCategoryStorage(db);
    try {
      await storage.initialize();
      const customExpense = await storage.createCategory({ type: 'expense', name: 'Custom Expense' });
      const customIncome = await storage.createCategory({ type: 'income', name: 'Custom Income' });
      const archivedExpense = await storage.createCategory({ type: 'expense', name: 'Archived Expense' });
      await storage.archiveCategory(archivedExpense.id, true);

      // Cannot reassign to self
      await expect(storage.deleteCategoryWithReassignment(customExpense.id, customExpense.id)).rejects.toThrow(/deleted/i);

      // Cannot reassign to different type
      await expect(storage.deleteCategoryWithReassignment(customExpense.id, customIncome.id)).rejects.toThrow(/type/i);

      // Cannot reassign to archived category
      await expect(storage.deleteCategoryWithReassignment(customExpense.id, archivedExpense.id)).rejects.toThrow(/archived/i);

      // Built-in categories can be deleted with reassignment.
      const categories = await storage.listCategories('expense');
      const builtIn = categories.find((c) => c.isBuiltin)!;
      await storage.deleteCategoryWithReassignment(builtIn.id, customExpense.id);
      expect((await storage.listCategories('expense')).some((category) => category.id === builtIn.id)).toBe(false);
    } finally {
      close();
    }
  });

  test('test_delete_category_without_transactions_removes_category_and_logs_tombstone', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    const storage = createCategoryStorage(db);
    try {
      await storage.initialize();
      const custom = await storage.createCategory({ type: 'expense', name: 'Unused Category' });
      const food = (await storage.listCategories('expense')).find((c) => c.name === 'Food')!;

      const result = await storage.deleteCategoryWithReassignment(custom.id, food.id);
      expect(result.reassignedCount).toBe(0);

      const all = await storage.listCategories('expense', true);
      expect(all.some((c) => c.id === custom.id)).toBe(false);

      const tombstones = await db.getAllAsync<{ entity_id: number }>(
        'SELECT entity_id FROM deleted_tombstones WHERE entity_type = "category" AND entity_id = ?;',
        custom.id
      );
      expect(tombstones).toHaveLength(1);
    } finally {
      close();
    }
  });
});
