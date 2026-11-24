import { describe, expect, test } from 'bun:test';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';
import { initializeSchema } from '../src/storage/schema';
import { createGoalStorage } from '../src/storage/goalStorage';
import { calculateGoalProgress } from '../src/lib/goalCalculations';
import { getBudgetThreshold, type BudgetProgress } from '../src/lib/budgetProgress';
import type { FinancialGoal } from '../src/storage/types';

describe('Financial Goals and Budget Warning Calculations', () => {
  describe('goalCalculations progress and projections', () => {
    test('test_calculate_goal_progress_percentages_and_caps', () => {
      const goal: FinancialGoal = {
        id: 1,
        title: 'Emergency Fund',
        targetAmountMinor: 10000000, // ₹1,00,000
        currentSavedMinor: 2500000, // ₹25,000 (25%)
        targetDate: null,
        status: 'active',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const progress = calculateGoalProgress(goal);
      expect(progress.percentage).toBe(25);
      expect(progress.remainingMinor).toBe(7500000);
      expect(progress.isCompleted).toBe(false);

      // Over-saved caps at 100%
      const completedGoal: FinancialGoal = {
        ...goal,
        currentSavedMinor: 12000000, // ₹1,20,000
      };
      const completedProgress = calculateGoalProgress(completedGoal);
      expect(completedProgress.percentage).toBe(100);
      expect(completedProgress.remainingMinor).toBe(0);
      expect(completedProgress.isCompleted).toBe(true);
    });

    test('test_calculate_goal_progress_projected_monthly_savings', () => {
      const goal: FinancialGoal = {
        id: 2,
        title: 'New Laptop',
        targetAmountMinor: 6000000, // ₹60,000
        currentSavedMinor: 1000000, // ₹10,000 saved, ₹50,000 remaining
        targetDate: '2026-08-01', // 5 months from 2026-03-01
        status: 'active',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const progress = calculateGoalProgress(goal, '2026-03-01');
      expect(progress.remainingMinor).toBe(5000000);
      expect(progress.projectedMonthlySavingsMinor).toBe(1000000); // ₹10,000 per month
    });

    test('projects savings for a future deadline in the current month', () => {
      const goal: FinancialGoal = {
        id: 3,
        title: 'Upcoming bill',
        targetAmountMinor: 10000,
        currentSavedMinor: 0,
        targetDate: '2026-03-31',
        status: 'active',
        createdAt: 1000,
        updatedAt: 1000,
      };

      expect(calculateGoalProgress(goal, '2026-03-01').projectedMonthlySavingsMinor).toBe(10000);
    });
  });

  describe('goalStorage CRUD and contribution operations', () => {
    test('test_goal_storage_crud_and_status_transitions', async () => {
      const { db, close } = createBunSqliteAdapter(':memory:');
      const storage = createGoalStorage(db);
      try {
        await initializeSchema(db);
        await storage.initialize();

        const created = await storage.addGoal({
          title: 'Vacation',
          targetAmountMinor: 5000000,
          currentSavedMinor: 500000,
          targetDate: '2026-12-31',
        });

        expect(created.id).toBeGreaterThan(0);
        expect(created.title).toBe('Vacation');
        expect(created.targetAmountMinor).toBe(5000000);
        expect(created.currentSavedMinor).toBe(500000);
        expect(created.status).toBe('active');

        // List
        const list = await storage.listGoals();
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe(created.id);

        // Update
        const updated = await storage.updateGoal(created.id, {
          title: 'Japan Vacation',
          targetAmountMinor: 6000000,
        });
        expect(updated.title).toBe('Japan Vacation');
        expect(updated.targetAmountMinor).toBe(6000000);

        // Delete
        await storage.deleteGoal(created.id);
        const remaining = await storage.listGoals();
        expect(remaining).toHaveLength(0);

        // Verify tombstone logged
        const tombstones = await db.getAllAsync<{ entity_type: string; entity_id: number }>(
          'SELECT entity_type, entity_id FROM deleted_tombstones WHERE entity_type = "goal";'
        );
        expect(tombstones).toHaveLength(1);
        expect(tombstones[0].entity_id).toBe(created.id);
      } finally {
        close();
      }
    });

    test('test_goal_deposit_and_withdraw_updates_current_saved_and_marks_completed', async () => {
      const { db, close } = createBunSqliteAdapter(':memory:');
      const storage = createGoalStorage(db);
      try {
        await initializeSchema(db);
        await storage.initialize();

        const created = await storage.addGoal({
          title: 'Course Tuition',
          targetAmountMinor: 2000000, // ₹20,000
          currentSavedMinor: 1000000, // ₹10,000
        });

        // Deposit ₹5,000
        const afterDeposit = await storage.contributeToGoal(created.id, 500000);
        expect(afterDeposit.currentSavedMinor).toBe(1500000);
        expect(afterDeposit.status).toBe('active');

        // Deposit another ₹5,000 to reach target
        const afterTarget = await storage.contributeToGoal(created.id, 500000);
        expect(afterTarget.currentSavedMinor).toBe(2000000);
        expect(afterTarget.status).toBe('completed');

        // Withdraw ₹2,000 should reopen if completed
        const afterWithdraw = await storage.contributeToGoal(created.id, -200000);
        expect(afterWithdraw.currentSavedMinor).toBe(1800000);
        expect(afterWithdraw.status).toBe('active');
      } finally {
        close();
      }
    });

    test('concurrent contributions are additive and reject unsafe or fractional paise', async () => {
      const { db, close } = createBunSqliteAdapter(':memory:');
      const storage = createGoalStorage(db);
      try {
        const created = await storage.addGoal({ title: 'Buffer', targetAmountMinor: 1000 });
        await Promise.all(Array.from({ length: 20 }, () => storage.contributeToGoal(created.id, 1)));

        const afterDeposits = await storage.listGoals();
        expect(afterDeposits[0].currentSavedMinor).toBe(20);
        await expect(storage.contributeToGoal(created.id, 1.5)).rejects.toThrow();
        await expect(storage.contributeToGoal(created.id, Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow();
        await expect(
          storage.addGoal({ title: 'Too large', targetAmountMinor: Number.MAX_SAFE_INTEGER + 1 })
        ).rejects.toThrow();
        expect((await storage.listGoals())[0].currentSavedMinor).toBe(20);
      } finally {
        close();
      }
    });
  });

  describe('budget warning thresholds', () => {
    function progressFor(budgetMinor: number, spentMinor: number): BudgetProgress {
      return {
        id: 1,
        categoryId: null,
        budgetMinor,
        spentMinor,
        remainingMinor: budgetMinor - spentMinor,
      };
    }

    test('test_budget_progress_warning_threshold_triggers_at_80_percent', () => {
      // Below 80% stays normal.
      expect(getBudgetThreshold(progressFor(100000, 0))).toEqual({
        status: 'normal',
        percentUsed: 0,
        overspentMinor: 0,
      });
      expect(getBudgetThreshold(progressFor(100000, 79000)).status).toBe('normal');
      expect(getBudgetThreshold(progressFor(100000, 79999)).status).toBe('normal');

      // Exactly 80% is the first warning boundary.
      const atEighty = getBudgetThreshold(progressFor(100000, 80000));
      expect(atEighty.status).toBe('warning');
      expect(atEighty.percentUsed).toBe(80);
      expect(atEighty.overspentMinor).toBe(0);

      // Anywhere between 80% and the limit stays a warning, with whole percent.
      expect(getBudgetThreshold(progressFor(100000, 85000))).toEqual({
        status: 'warning',
        percentUsed: 85,
        overspentMinor: 0,
      });
      expect(getBudgetThreshold(progressFor(100000, 99000)).status).toBe('warning');
      const justUnder = getBudgetThreshold(progressFor(100000, 99999));
      expect(justUnder.status).toBe('warning');
      expect(justUnder.percentUsed).toBe(99);
    });

    test('test_budget_progress_danger_threshold_triggers_at_100_percent', () => {
      // Reaching the limit exactly is danger, with nothing overspent yet.
      const atLimit = getBudgetThreshold(progressFor(100000, 100000));
      expect(atLimit.status).toBe('danger');
      expect(atLimit.percentUsed).toBe(100);
      expect(atLimit.overspentMinor).toBe(0);

      // Past the limit reports the exact overspend in paise.
      const over = getBudgetThreshold(progressFor(100000, 105000));
      expect(over.status).toBe('danger');
      expect(over.percentUsed).toBe(105);
      expect(over.overspentMinor).toBe(5000);

      expect(getBudgetThreshold(progressFor(1000, 1001))).toEqual({
        status: 'danger',
        percentUsed: 100,
        overspentMinor: 1,
      });

      // 99% remains a warning, not danger.
      expect(getBudgetThreshold(progressFor(100000, 99000)).status).toBe('warning');
    });
  });
});
