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

import BudgetForm from '../components/BudgetForm';
import ScreenHeader from '../components/ScreenHeader';
import { ErrorBanner, ErrorView, LoadingView } from '../components/StateViews';
import { formatMinorUnits } from '../lib/money';
import type { Budget, NewBudgetInput } from '../storage';
import { useTransactions } from '../state/TransactionsContext';
import { colors, elevation, fontSize, radius, spacing } from '../theme/theme';

interface EditingScope {
  /** Remounts the form whenever a different scope is opened. */
  key: string;
  /** Preselected scope when creating a new limit. */
  categoryId: number | null;
  /** Present only when editing an existing limit. */
  budget?: Budget;
}

export default function BudgetsScreen() {
  const {
    budgets,
    categories,
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
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
      />

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

          <Text style={styles.sectionTitle} accessibilityRole="header">
            Overall monthly limit
          </Text>
          <View style={styles.card}>
            {overallBudget ? (
              <View
                style={styles.limitRow}
              >
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: fontSize.label,
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
    minHeight: 44,
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
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    minHeight: 44,
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
});
