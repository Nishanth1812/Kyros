import { describe, expect, it } from 'bun:test';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';
import { initializeSchema } from '../src/storage/schema';
import { generateSyncDelta, applySyncDelta } from '../src/storage/syncEngine';
import { createSyncStorage } from '../src/storage/syncStorage';
import type { KyrosSyncDeltaV1 } from '../src/storage/types';

describe('syncEngine (draft)', () => {
  it('generate extracts entities updated after timestamp', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);
      const storage = createSyncStorage(db);
      await storage.initialize();
      const now = 1000;
      await db.runAsync(
        'INSERT INTO categories (id, type, name, is_builtin, is_archived, updated_at) VALUES (?,?,?,?,?,?)',
        101, 'expense', 'Books', 0, 0, 2000
      );
      await db.runAsync(
        'INSERT INTO transactions (id, type, amount_minor, date, description, created_at, category_id, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        201, 'expense', 100, '2026-01-01', 'x', 1500, 101, 1500
      );
      const delta = await generateSyncDelta(db, 1000);
      expect(delta.changes.categories.length).toBe(13);
      expect(delta.changes.transactions.length).toBe(1);
      expect(delta.sinceTimestamp).toBe(1000);
    } finally { close(); }
  });

  it('generate extracts tombstones', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);
      const storage = createSyncStorage(db);
      await storage.initialize();
      await storage.recordTombstone('transaction', 5, 2000);
      const delta = await generateSyncDelta(db, 1000);
      expect(delta.tombstones.length).toBe(1);
      expect(delta.tombstones[0].entityId).toBe(5);
    } finally { close(); }
  });

  it('apply inserts new and updates newer', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);
      const storage = createSyncStorage(db);
      await storage.initialize();
      // local older transaction
      await db.runAsync(
        'INSERT INTO transactions (id, type, amount_minor, date, description, created_at, category_id, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        1, 'expense', 100, '2026-01-01', 'old', 1000, 8, 1000
      );
      // category 8 exists? built-in Other expense id maybe 8. Let's ensure category 8 exists.
      const delta: KyrosSyncDeltaV1 = {
        version: 1,
        clientTimestamp: 3000,
        sinceTimestamp: 0,
        changes: {
          transactions: [{ id: 1, type: 'expense', amountMinor: 200, date: '2026-01-02', description: 'new', categoryId: 8, createdAt: 1000, updatedAt: 2000 }],
          categories: [],
          budgets: [],
          goals: [],
          recurring: [],
        },
        tombstones: [],
      };
      const res = await applySyncDelta(db, delta);
      expect(res.transactions.updated).toBe(1);
      const row = await db.getFirstAsync<{ amount_minor: number }>('SELECT amount_minor FROM transactions WHERE id=1');
      expect(row?.amount_minor).toBe(200);
    } finally { close(); }
  });

  it('apply preserves local edits when local newer', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);
      const storage = createSyncStorage(db);
      await storage.initialize();
      await db.runAsync(
        'INSERT INTO transactions (id, type, amount_minor, date, description, created_at, category_id, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        1, 'expense', 100, '2026-01-01', 'local', 1000, 8, 5000
      );
      const delta: KyrosSyncDeltaV1 = {
        version: 1,
        clientTimestamp: 3000,
        sinceTimestamp: 0,
        changes: {
          transactions: [{ id: 1, type: 'expense', amountMinor: 200, date: '2026-01-02', description: 'remote', categoryId: 8, createdAt: 1000, updatedAt: 2000 }],
          categories: [],
          budgets: [],
          goals: [],
          recurring: [],
        },
        tombstones: [],
      };
      const res = await applySyncDelta(db, delta);
      expect(res.transactions.skipped).toBe(1);
      const row = await db.getFirstAsync<{ amount_minor: number }>('SELECT amount_minor FROM transactions WHERE id=1');
      expect(row?.amount_minor).toBe(100);
    } finally { close(); }
  });

  it('apply deletes records in tombstones', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);
      const storage = createSyncStorage(db);
      await storage.initialize();
      await db.runAsync(
        'INSERT INTO transactions (id, type, amount_minor, date, description, created_at, category_id, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        7, 'expense', 100, '2026-01-01', 'x', 1000, 8, 1000
      );
      const delta: KyrosSyncDeltaV1 = {
        version: 1,
        clientTimestamp: 3000,
        sinceTimestamp: 0,
        changes: { transactions: [], categories: [], budgets: [], goals: [], recurring: [] },
        tombstones: [{ id: 1, entityType: 'transaction', entityId: 7, deletedAt: 2000 }],
      };
      const res = await applySyncDelta(db, delta);
      expect(res.transactions.deleted).toBe(1);
      const rows = await db.getAllAsync('SELECT * FROM transactions WHERE id=7');
      expect(rows.length).toBe(0);
    } finally { close(); }
  });

  it('does not retain a category tombstone when dependents block deletion', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);
      const storage = createSyncStorage(db);
      await storage.initialize();
      const category = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM categories WHERE type = 'expense' AND name = 'Food';`
      );
      await db.runAsync(
        `INSERT INTO transactions (type, amount_minor, date, description, created_at, category_id, updated_at)
         VALUES ('expense', 100, '2026-01-01', 'Lunch', 1000, ?, 1000);`,
        category!.id
      );
      const delta: KyrosSyncDeltaV1 = {
        version: 1,
        clientTimestamp: 3000,
        sinceTimestamp: 0,
        changes: { transactions: [], categories: [], budgets: [], goals: [], recurring: [] },
        tombstones: [{ id: 1, entityType: 'category', entityId: category!.id, deletedAt: 2000 }],
      };

      const result = await applySyncDelta(db, delta);
      expect(result.categories.skipped).toBe(1);
      expect(await storage.getTombstone('category', category!.id)).toBeNull();
    } finally { close(); }
  });

  it('idempotent apply', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);
      const storage = createSyncStorage(db);
      await storage.initialize();
      const delta: KyrosSyncDeltaV1 = {
        version: 1,
        clientTimestamp: 3000,
        sinceTimestamp: 0,
        changes: {
          transactions: [{ id: 9, type: 'expense', amountMinor: 100, date: '2026-01-01', description: null, categoryId: 8, createdAt: 1000, updatedAt: 1000 }],
          categories: [],
          budgets: [],
          goals: [],
          recurring: [],
        },
        tombstones: [],
      };
      const r1 = await applySyncDelta(db, delta);
      const r2 = await applySyncDelta(db, delta);
      expect(r1.transactions.inserted).toBe(1);
      expect(r2.transactions.inserted).toBe(0);
      expect(r2.transactions.skipped).toBe(1);
    } finally { close(); }
  });

  it('does not delete a goal newer than its tombstone when updated_at is zero', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);
      await db.runAsync(
        `INSERT INTO financial_goals
          (id, title, target_amount_minor, current_saved_minor, status, created_at, updated_at)
         VALUES (1, 'New goal', 10000, 0, 'active', 5000, 0);`
      );
      const delta: KyrosSyncDeltaV1 = {
        version: 1,
        clientTimestamp: 6000,
        sinceTimestamp: 0,
        changes: { transactions: [], categories: [], budgets: [], goals: [], recurring: [] },
        tombstones: [{ id: 1, entityType: 'goal', entityId: 1, deletedAt: 2000 }],
      };

      const result = await applySyncDelta(db, delta);
      expect(result.goals.skipped).toBe(1);
      const row = await db.getFirstAsync<{ title: string }>('SELECT title FROM financial_goals WHERE id = 1;');
      expect(row?.title).toBe('New goal');
    } finally { close(); }
  });

  it('keeps repeated tombstone recording idempotent', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      const storage = createSyncStorage(db);
      await storage.initialize();
      await storage.recordTombstone('category', 101, 2000);
      const before = await storage.getTombstone('category', 101);
      await storage.recordTombstone('category', 101, 2000);
      const after = await storage.getTombstone('category', 101);
      expect(after).toEqual(before);
    } finally { close(); }
  });

  it('normalizes legacy category timestamps before generating deltas', async () => {
    const { db, close } = createBunSqliteAdapter();
    try {
      await initializeSchema(db);
      const category = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM categories WHERE type = 'expense' AND name = 'Food';`
      );
      await db.runAsync('UPDATE categories SET updated_at = 0 WHERE id = ?;', category!.id);
      const delta = await generateSyncDelta(db, 0);
      expect(delta.changes.categories.some((item) => item.id === category!.id && item.updatedAt > 0)).toBe(true);
    } finally { close(); }
  });
});
