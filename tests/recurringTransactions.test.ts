import { describe, expect, test } from 'bun:test';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';
import { initializeSchema } from '../src/storage/schema';
import { createRecurringStorage } from '../src/storage/recurringStorage';
import { calculateNextDueDate, findDueRecurringTransactions } from '../src/lib/recurringEngine';
import type { RecurringTransaction } from '../src/storage/types';

describe('Recurring Transactions Engine and Storage', () => {
  describe('recurringEngine date arithmetic', () => {
    test('test_calculate_next_due_date_daily_and_weekly', () => {
      expect(calculateNextDueDate('2026-03-01', 'daily')).toBe('2026-03-02');
      expect(calculateNextDueDate('2026-03-31', 'daily')).toBe('2026-04-01');

      expect(calculateNextDueDate('2026-03-01', 'weekly')).toBe('2026-03-08');
      expect(calculateNextDueDate('2026-03-28', 'weekly')).toBe('2026-04-04');
    });

    test('test_calculate_next_due_date_monthly_pins_to_month_end_correctly', () => {
      // Regular month progression
      expect(calculateNextDueDate('2026-01-15', 'monthly')).toBe('2026-02-15');

      // Month end pinning: Jan 31 -> Feb 28 (2026 is not a leap year)
      expect(calculateNextDueDate('2026-01-31', 'monthly')).toBe('2026-02-28');

      // March 31 -> April 30
      expect(calculateNextDueDate('2026-03-31', 'monthly')).toBe('2026-04-30');

      // May 31 -> June 30
      expect(calculateNextDueDate('2026-05-31', 'monthly')).toBe('2026-06-30');

      // Dec 31 -> Jan 31 next year
      expect(calculateNextDueDate('2026-12-31', 'monthly')).toBe('2027-01-31');
    });

    test('test_calculate_next_due_date_yearly_handles_leap_years', () => {
      expect(calculateNextDueDate('2026-06-15', 'yearly')).toBe('2027-06-15');

      // 2028 is a leap year; Feb 29 2028 -> Feb 28 2029
      expect(calculateNextDueDate('2028-02-29', 'yearly')).toBe('2029-02-28');
    });

    test('test_find_due_recurring_transactions_filters_by_date_and_active_status', () => {
      const items: RecurringTransaction[] = [
        {
          id: 1,
          amountMinor: 500000,
          type: 'expense',
          categoryId: 1,
          description: 'Rent',
          frequency: 'monthly',
          nextDueDate: '2026-03-01',
          isActive: true,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 2,
          amountMinor: 15000,
          type: 'expense',
          categoryId: 2,
          description: 'Gym',
          frequency: 'monthly',
          nextDueDate: '2026-03-10',
          isActive: true,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 3,
          amountMinor: 3000000,
          type: 'income',
          categoryId: 3,
          description: 'Salary',
          frequency: 'monthly',
          nextDueDate: '2026-03-01',
          isActive: false, // Paused
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      // As of 2026-03-05: only item 1 is active and due on or before March 5
      const due = findDueRecurringTransactions(items, '2026-03-05');
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe(1);

      // As of 2026-03-15: item 1 and item 2 are due; item 3 is ignored because inactive
      const dueLater = findDueRecurringTransactions(items, '2026-03-15');
      expect(dueLater).toHaveLength(2);
      expect(dueLater.map((d) => d.id)).toEqual([1, 2]);
    });
  });

  describe('recurringStorage CRUD and application', () => {
    test('test_recurring_storage_crud_persists_and_updates_timestamps', async () => {
      const { db, close } = createBunSqliteAdapter(':memory:');
      const storage = createRecurringStorage(db);
      try {
        await initializeSchema(db);
        await storage.initialize();

        const created = await storage.addRecurring({
          amountMinor: 120000,
          type: 'expense',
          categoryId: 1,
          description: 'Internet bill',
          frequency: 'monthly',
          nextDueDate: '2026-04-05',
          isActive: true,
        });

        expect(created.id).toBeGreaterThan(0);
        expect(created.amountMinor).toBe(120000);
        expect(created.description).toBe('Internet bill');
        expect(created.frequency).toBe('monthly');
        expect(created.nextDueDate).toBe('2026-04-05');
        expect(created.isActive).toBe(true);

        // List
        const list = await storage.listRecurring();
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe(created.id);

        // Toggle active
        const paused = await storage.toggleRecurringActive(created.id, false);
        expect(paused.isActive).toBe(false);

        // Update
        const updated = await storage.updateRecurring(created.id, {
          amountMinor: 150000,
          description: 'Fiber internet',
        });
        expect(updated.amountMinor).toBe(150000);
        expect(updated.description).toBe('Fiber internet');

        // Delete
        await storage.deleteRecurring(created.id);
        const remaining = await storage.listRecurring();
        expect(remaining).toHaveLength(0);

        // Verify tombstone logged
        const tombstones = await db.getAllAsync<{ entity_type: string; entity_id: number }>(
          'SELECT entity_type, entity_id FROM deleted_tombstones WHERE entity_type = "recurring";'
        );
        expect(tombstones).toHaveLength(1);
        expect(tombstones[0].entity_id).toBe(created.id);
      } finally {
        close();
      }
    });

    test('test_apply_recurring_transaction_inserts_transaction_and_advances_due_date', async () => {
      const { db, close } = createBunSqliteAdapter(':memory:');
      const storage = createRecurringStorage(db);
      try {
        await initializeSchema(db);
        await storage.initialize();

        const created = await storage.addRecurring({
          amountMinor: 750000,
          type: 'expense',
          categoryId: 1,
          description: 'Apartment rent',
          frequency: 'monthly',
          nextDueDate: '2026-03-01',
          isActive: true,
        });

        // Apply it
        const result = await storage.applyRecurring(created.id);

        // Transaction should be inserted
        expect(result.transaction).toBeDefined();
        expect(result.transaction.amountMinor).toBe(750000);
        expect(result.transaction.date).toBe('2026-03-01');
        expect(result.transaction.description).toBe('Apartment rent');
        expect(result.transaction.categoryId).toBe(1);

        // Next due date should be advanced to April 1
        expect(result.nextDueDate).toBe('2026-04-01');

        const reloaded = (await storage.listRecurring()).find((r) => r.id === created.id);
        expect(reloaded?.nextDueDate).toBe('2026-04-01');

        // Check transactions table directly
        const txs = await db.getAllAsync<{ id: number; amount_minor: number; date: string }>(
          'SELECT id, amount_minor, date FROM transactions;'
        );
        expect(txs).toHaveLength(1);
        expect(txs[0].amount_minor).toBe(750000);
        expect(txs[0].date).toBe('2026-03-01');
      } finally {
        close();
      }
    });
  });
});
