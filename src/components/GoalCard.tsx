import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMinorUnits } from '../lib/money';
import type { FinancialGoal, GoalProgress } from '../storage';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';

export interface GoalCardProps {
  goal: FinancialGoal;
  progress: GoalProgress;
  onAddSavings: (goal: FinancialGoal) => void;
  onWithdraw: (goal: FinancialGoal) => void;
  /** Rendered as a destructive action when provided. */
  onDelete?: (goal: FinancialGoal) => void;
}

/**
 * Presentational progress card for one financial goal. Progress math is
 * supplied by the caller; this component only renders and reports taps.
 */
export default function GoalCard({
  goal,
  progress,
  onAddSavings,
  onWithdraw,
  onDelete,
}: GoalCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const percent = Math.min(100, Math.max(0, progress.percentage));
  const isCompleted = progress.isCompleted || goal.status === 'completed';
  const canWithdraw = goal.currentSavedMinor > 0;
  const targetLabel = goal.targetDate
    ? `Target date ${goal.targetDate}.`
    : 'No target date.';
  const statusLabel = isCompleted ? 'Completed' : 'Active';
  const remainingLabel = isCompleted
    ? 'Target reached.'
    : `${formatMinorUnits(progress.remainingMinor)} remaining.`;
  const projectionLabel =
    progress.projectedMonthlySavingsMinor !== undefined
      ? ` Save about ${formatMinorUnits(progress.projectedMonthlySavingsMinor)} per month to reach it on time.`
      : '';
  const accessibilityLabel =
    `${goal.title}. ${formatMinorUnits(goal.currentSavedMinor)} saved of ` +
    `${formatMinorUnits(goal.targetAmountMinor)}. ${percent} percent saved. ` +
    `${remainingLabel} ${targetLabel} Status: ${statusLabel}.${projectionLabel}`;

  return (
    <View style={styles.card}>
      <View accessible accessibilityLabel={accessibilityLabel}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>
            {goal.title}
          </Text>
          {isCompleted ? (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>Completed</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.savedText}>
          {formatMinorUnits(goal.currentSavedMinor)} of{' '}
          {formatMinorUnits(goal.targetAmountMinor)}
        </Text>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              isCompleted ? styles.progressFillCompleted : null,
              { width: `${percent}%` },
            ]}
          />
        </View>

        <Text style={styles.progressText}>{percent}% saved</Text>
        <Text style={[styles.remainingText, isCompleted ? styles.completedText : null]}>
          {remainingLabel}
        </Text>
        <Text style={styles.detailText}>
          {targetLabel}
          {projectionLabel}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => onAddSavings(goal)}
          disabled={isCompleted}
          accessibilityRole="button"
          accessibilityLabel={`Add savings to ${goal.title}`}
          accessibilityState={{ disabled: isCompleted }}
          style={({ pressed }) => [
            styles.action,
            styles.addAction,
            pressed && !isCompleted ? styles.actionPressed : null,
            isCompleted ? styles.actionDisabled : null,
          ]}
        >
          <Text style={styles.addActionText}>Add savings</Text>
        </Pressable>

        <Pressable
          onPress={() => onWithdraw(goal)}
          disabled={!canWithdraw}
          accessibilityRole="button"
          accessibilityLabel={`Withdraw savings from ${goal.title}`}
          accessibilityState={{ disabled: !canWithdraw }}
          style={({ pressed }) => [
            styles.action,
            styles.withdrawAction,
            pressed && canWithdraw ? styles.actionPressed : null,
            !canWithdraw ? styles.actionDisabled : null,
          ]}
        >
          <Text style={styles.withdrawActionText}>Withdraw</Text>
        </Pressable>

        {onDelete ? (
          <Pressable
            onPress={() => onDelete(goal)}
            accessibilityRole="button"
            accessibilityLabel={`Delete goal ${goal.title}`}
            style={({ pressed }) => [
              styles.action,
              styles.deleteAction,
              pressed ? styles.actionPressed : null,
            ]}
          >
            <Text style={styles.deleteActionText}>Delete</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...elevation,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  completedBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.subtleGreen,
  },
  completedBadgeText: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.income,
  },
  savedText: {
    marginTop: spacing.xs,
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.primary,
  },
  progressTrack: {
    height: 8,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  progressFillCompleted: {
    backgroundColor: colors.income,
  },
  progressText: {
    marginTop: spacing.xs,
    fontSize: fontSize.small,
    color: colors.textMuted,
  },
  remainingText: {
    marginTop: spacing.xs,
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.text,
  },
  completedText: {
    color: colors.income,
  },
  detailText: {
    marginTop: spacing.xs,
    fontSize: fontSize.caption,
    lineHeight: 18,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: {
    flex: 1,
    minWidth: 48,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  addAction: {
    backgroundColor: colors.primary,
  },
  addActionText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  withdrawAction: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  withdrawActionText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.text,
  },
  deleteAction: {
    backgroundColor: colors.subtleRed,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteActionText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.danger,
  },
});
