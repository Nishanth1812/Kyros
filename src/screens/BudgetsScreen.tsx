import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  type CompositeNavigationProp,
  useNavigation,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BudgetForm from '../components/BudgetForm';
import ScreenHeader from '../components/ScreenHeader';
import { ErrorBanner, ErrorView, LoadingView } from '../components/StateViews';
import {
  calculateBudgetProgress,
  getBudgetThreshold,
  type BudgetProgress,
} from '../lib/budgetProgress';
import { currentMonthBounds, currentMonthLabel } from '../lib/dates';
import { formatMinorUnits } from '../lib/money';
import type { RootStackParamList, RootTabParamList } from '../navigation/types';
import type { Budget, NewBudgetInput } from '../storage';
import { useTransactions } from '../state/TransactionsContext';
import { responsivePageContentStyle, touchTargetStyle } from '../theme/layout';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Budgets'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

/** Spent/remaining against one saved limit, with a bar capped at 100%. */
function BudgetProgressDetails({
  progress,
  label,
}: {
  progress: BudgetProgress;
  label: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const threshold = getBudgetThreshold(progress);
  const percent = Math.min(100, threshold.percentUsed);
  const status =
    threshold.status === 'danger'
      ? `Over budget by ${formatMinorUnits(threshold.overspentMinor)}`
      : threshold.status === 'warning'
        ? `Approaching limit (${threshold.percentUsed}% used)`
        : `Remaining ${formatMinorUnits(progress.remainingMinor)}`;
  const remainingLabel =
    threshold.status === 'danger' ? 'Over by' : 'Remaining';
  const remainingValue =
    threshold.status === 'danger'
      ? formatMinorUnits(threshold.overspentMinor)
      : formatMinorUnits(progress.remainingMinor);
  const remainingStyle =
    threshold.status === 'danger'
      ? styles.figureValueDanger
      : threshold.status === 'warning'
        ? styles.figureValueWarning
        : styles.figureValueNormal;

  return (
    <View
      style={styles.progressBlock}
      accessible
      accessibilityLabel={`${label}: spent ${formatMinorUnits(
        progress.spentMinor
      )} of ${formatMinorUnits(progress.budgetMinor)} this month. ${status}.`}
    >
      <View style={styles.progressFigures}>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>Used</Text>
          <Text style={styles.figureValue}>
            {formatMinorUnits(progress.spentMinor)}
          </Text>
        </View>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>{remainingLabel}</Text>
          <Text style={[styles.figureValue, remainingStyle]}>{remainingValue}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            threshold.status === 'warning' ? styles.progressFillWarning : null,
            threshold.status === 'danger' ? styles.progressFillDanger : null,
            { width: `${percent}%` },
          ]}
        />
      </View>
      {threshold.status === 'normal' ? null : (
        <View
          style={[
            styles.statusBadge,
            threshold.status === 'danger'
              ? styles.statusBadgeDanger
              : styles.statusBadgeWarning,
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              threshold.status === 'danger'
                ? styles.statusBadgeTextDanger
                : styles.statusBadgeTextWarning,
            ]}
          >
            {status}
          </Text>
        </View>
      )}
    </View>
  );
}

interface EditingScope {
  /** Remounts the form whenever a different scope is opened. */
  key: string;
  /** Preselected scope when creating a new limit. */
  categoryId: number | null;
  /** Present only when editing an existing limit. */
  budget?: Budget;
}

export default function BudgetsScreen() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const navigation = useNavigation<Navigation>();
  const {
    budgets,
    transactions,
    categories,
    goals,
    status,
    error,
    refresh,
    saveBudget,
    deleteBudget,
  } = useTransactions();
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<EditingScope | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense'),
    [categories]
  );
  const overallBudget = budgets.find((budget) => budget.categoryId === null);
  const categoryBudgets = useMemo(() => {
    const byCategory = new Map<number, Budget>();
    for (const budget of budgets) {
      if (budget.categoryId !== null) byCategory.set(budget.categoryId, budget);
    }
    return byCategory;
  }, [budgets]);

  // Recomputed on each render so a refresh after midnight or a month rollover
  // uses the current local calendar. Actuals always come from stored history.
  const now = new Date();
  const bounds = currentMonthBounds(now);
  const { progress, progressError } = useMemo<{
    progress: BudgetProgress[];
    progressError: string | null;
  }>(() => {
    try {
      return {
        progress: calculateBudgetProgress(
          budgets,
          transactions,
          bounds.dateFrom,
          bounds.dateTo
        ),
        progressError: null,
      };
    } catch (cause) {
      return { progress: [], progressError: toMessage(cause) };
    }
  }, [budgets, transactions, bounds.dateFrom, bounds.dateTo]);
  const progressById = useMemo(
    () => new Map(progress.map((entry) => [entry.id, entry])),
    [progress]
  );
  const overallProgress = overallBudget
    ? progressById.get(overallBudget.id)
    : undefined;

  const formBudget = editing?.budget;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async (input: NewBudgetInput) => {
    await saveBudget(input);
  };

  const handleDeleteBudget = (budget: Budget): Promise<boolean> => {
    const label =
      budget.categoryId === null
        ? 'overall'
        : categories.find((category) => category.id === budget.categoryId)?.name ??
          'category';
    return new Promise((resolve, reject) => {
      let settled = false;
      let removalStarted = false;
      const finish = (removed: boolean) => {
        if (settled) return;
        settled = true;
        resolve(removed);
      };

      Alert.alert(
        'Remove budget',
        `Remove the ${label} monthly limit? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => finish(false) },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              removalStarted = true;
              try {
                await deleteBudget(budget.id);
                finish(true);
              } catch (cause) {
                settled = true;
                reject(cause);
              }
            },
          },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            if (!removalStarted) finish(false);
          },
        }
      );
    });
  };

  const openCreate = (categoryId: number | null) => {
    setEditing({ key: `create-${categoryId ?? 'overall'}`, categoryId });
  };

  const openEdit = (budget: Budget) => {
    setEditing({
      key: `edit-${budget.id}`,
      categoryId: budget.categoryId,
      budget,
    });
  };

  const activeGoalCount = goals.filter((goal) => goal.status === 'active').length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[responsivePageContentStyle, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <ScreenHeader
        title="Budgets"
        subtitle="Set a recurring monthly limit for all expenses or for individual expense categories. Limits reset each calendar month."
        onSettingsPress={() => navigation.navigate('Settings')}
      />

      <Pressable
        onPress={() => navigation.navigate('FinancialGoals')}
        accessibilityRole="button"
        accessibilityLabel={`Savings goals${
          activeGoalCount > 0 ? `: ${activeGoalCount} active` : ''
        }`}
        accessibilityHint="Opens savings goals with targets and contributions"
        style={({ pressed }) => [
          styles.goalsCard,
          pressed ? styles.cardActionPressed : null,
        ]}
      >
        <View style={styles.goalsCardInfo}>
          <Text style={styles.goalsCardTitle}>Savings goals</Text>
          <Text style={styles.goalsCardText}>
            {activeGoalCount > 0
              ? `${activeGoalCount} active goal${activeGoalCount === 1 ? '' : 's'} in progress.`
              : 'Track targets like an emergency fund or a trip.'}
          </Text>
        </View>
        <Text style={styles.cardActionText}>Open</Text>
      </Pressable>

      {status === 'loading' ? <LoadingView subject="budgets" /> : null}
      {status === 'error' ? (
        <ErrorView
          message={error ?? 'Unknown error.'}
          onRetry={() => void refresh()}
          subject="budgets"
        />
      ) : null}
      {status === 'ready' ? (
        <>
          {error ? <ErrorBanner message={error} /> : null}
          {progressError ? <ErrorBanner message={progressError} /> : null}
          {editing ? (
            <BudgetForm
              key={editing.key}
              categories={expenseCategories}
              initialCategoryId={editing.categoryId}
              initialValues={
                formBudget
                  ? {
                      categoryId: formBudget.categoryId,
                      amountMinor: formBudget.amountMinor,
                    }
                  : undefined
              }
              onSave={(input) => handleSave(input)}
              onDelete={formBudget ? () => handleDeleteBudget(formBudget) : undefined}
              onCancel={() => {
                setEditing(null);
              }}
            />
          ) : null}

          <Text style={styles.sectionHint}>
            Progress reflects saved expenses for {currentMonthLabel(now)}.
          </Text>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Overall monthly limit
          </Text>
          <View style={styles.card}>
            {overallBudget ? (
              <View>
                <View style={styles.limitRow}>
                  <View style={styles.limitInfo}>
                    <Text style={styles.limitName}>All expenses</Text>
                    <Text style={styles.limitAmount}>
                      {formatMinorUnits(overallBudget.amountMinor)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => openEdit(overallBudget)}
                    accessibilityRole="button"
                    accessibilityLabel="Edit overall limit"
                    style={({ pressed }) => [
                      styles.cardAction,
                      pressed ? styles.cardActionPressed : null,
                    ]}
                  >
                    <Text style={styles.cardActionText}>Edit</Text>
                  </Pressable>
                </View>
                {overallProgress ? (
                  <BudgetProgressDetails
                    progress={overallProgress}
                    label="All expenses"
                  />
                ) : null}
              </View>
            ) : (
              <View style={styles.missingScope}>
                <Text style={styles.emptyText}>No overall limit set.</Text>
                <Pressable
                  onPress={() => openCreate(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Set overall limit"
                  style={({ pressed }) => [
                    styles.setAction,
                    pressed ? styles.setActionPressed : null,
                  ]}
                >
                  <Text style={styles.setActionText}>+ Set overall limit</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle} accessibilityRole="header">
            Category limits
          </Text>
          <Text style={styles.sectionHint}>
            Limits apply only to expense categories.
          </Text>
          {expenseCategories.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                No expense categories yet. Add one from the Add tab to set a
                category limit.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              {expenseCategories.map((category, index) => {
                const budget = categoryBudgets.get(category.id);
                const budgetProgress = budget
                  ? progressById.get(budget.id)
                  : undefined;
                return (
                  <View key={category.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View
                      style={styles.limitRow}
                    >
                      <View style={styles.limitInfo}>
                        <Text style={styles.limitName}>{category.name}</Text>
                        <Text
                          style={[
                            styles.limitAmount,
                            budget ? null : styles.limitUnset,
                          ]}
                        >
                          {budget ? formatMinorUnits(budget.amountMinor) : 'Not set'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() =>
                          budget ? openEdit(budget) : openCreate(category.id)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={
                          budget
                            ? `Edit ${category.name} limit`
                            : `Set ${category.name} limit`
                        }
                        style={({ pressed }) => [
                          styles.cardAction,
                          pressed ? styles.cardActionPressed : null,
                        ]}
                      >
                        <Text style={styles.cardActionText}>
                          {budget ? 'Edit' : 'Set'}
                        </Text>
                      </Pressable>
                    </View>
                    {budgetProgress ? (
                      <BudgetProgressDetails
                        progress={budgetProgress}
                        label={category.name}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          {budgets.length === 0 ? (
            <Text style={styles.emptyHint}>
              Set a limit above to start planning your monthly spending.
            </Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  goalsCard: {
    ...touchTargetStyle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...elevation,
  },
  goalsCardInfo: {
    flex: 1,
  },
  goalsCardTitle: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  goalsCardText: {
    marginTop: spacing.xs,
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
  },
  sectionHint: {
    marginBottom: spacing.sm,
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...elevation,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: spacing.sm,
  },
  limitInfo: {
    flex: 1,
  },
  limitName: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.text,
  },
  limitAmount: {
    marginTop: spacing.xs,
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.primary,
  },
  limitUnset: {
    fontSize: fontSize.body,
    fontWeight: '400',
    color: colors.textMuted,
  },
  cardAction: {
    ...touchTargetStyle,
    minWidth: 56,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  cardActionPressed: {
    backgroundColor: colors.subtleGreen,
  },
  cardActionText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.primary,
  },
  missingScope: {
    minHeight: 48,
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: fontSize.body,
    lineHeight: 22,
    color: colors.textMuted,
  },
  setAction: {
    ...touchTargetStyle,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  setActionPressed: {
    opacity: 0.7,
  },
  setActionText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  emptyHint: {
    marginTop: spacing.md,
    fontSize: fontSize.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
  progressBlock: {
    marginTop: spacing.md,
  },
  progressFigures: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  figure: {
    flex: 1,
  },
  figureLabel: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  figureValue: {
    marginTop: spacing.xs,
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  figureValueNormal: {
    color: colors.income,
  },
  figureValueWarning: {
    color: colors.warning,
  },
  figureValueDanger: {
    color: colors.danger,
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
  progressFillWarning: {
    backgroundColor: colors.warning,
  },
  progressFillDanger: {
    backgroundColor: colors.expense,
  },
  statusBadge: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusBadgeWarning: {
    backgroundColor: colors.subtleWarning,
    borderColor: colors.warning,
  },
  statusBadgeDanger: {
    backgroundColor: colors.subtleRed,
    borderColor: colors.expense,
  },
  statusBadgeText: {
    fontSize: fontSize.small,
    fontWeight: '700',
  },
  statusBadgeTextWarning: {
    color: colors.text,
  },
  statusBadgeTextDanger: {
    color: colors.danger,
  },
});
