import type { FinancialGoal, GoalProgress } from '../storage/types';

/**
 * Calculates progress, remaining balance, completion state, and required monthly
 * savings towards a financial goal.
 */
export function calculateGoalProgress(goal: FinancialGoal, asOfDate?: string): GoalProgress {
  const percentage =
    goal.targetAmountMinor > 0
      ? Math.min(100, Math.floor((goal.currentSavedMinor / goal.targetAmountMinor) * 100))
      : 0;

  const remainingMinor = Math.max(0, goal.targetAmountMinor - goal.currentSavedMinor);
  const isCompleted = goal.status === 'completed' || remainingMinor === 0;

  let projectedMonthlySavingsMinor: number | undefined;

  if (goal.targetDate && remainingMinor > 0) {
    const today = asOfDate || new Date().toISOString().split('T')[0];
    const todayTime = Date.parse(`${today}T00:00:00.000Z`);
    const targetTime = Date.parse(`${goal.targetDate}T00:00:00.000Z`);

    if (Number.isFinite(todayTime) && Number.isFinite(targetTime) && targetTime > todayTime) {
      const [currY, currM] = today.split('-').map(Number);
      const [targetY, targetM] = goal.targetDate.split('-').map(Number);
      const monthsRemaining = Math.max(1, (targetY - currY) * 12 + (targetM - currM));
      projectedMonthlySavingsMinor = Math.ceil(remainingMinor / monthsRemaining);
    }
  }

  return {
    percentage,
    remainingMinor,
    isCompleted,
    projectedMonthlySavingsMinor,
  };
}
