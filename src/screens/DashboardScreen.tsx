import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import ScreenHeader from '../components/ScreenHeader';
import { ErrorBanner, ErrorView, LoadingView } from '../components/StateViews';
import { currentMonthBounds, currentMonthLabel } from '../lib/dates';
import { formatMinorUnits } from '../lib/money';
import { summarizeTransactions, type DashboardSummary } from '../lib/summaries';
import { useTransactions } from '../state/TransactionsContext';
import { colors, elevation, fontSize, radius, spacing } from '../theme/theme';

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

export default function DashboardScreen() {
  const { transactions, categories, status, error, refresh } = useTransactions();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  // Recomputed on each render so a refresh after midnight/month rollover uses
  // the current local calendar. The data itself always comes from the context.
  const now = new Date();
  const bounds = currentMonthBounds(now);
  const label = currentMonthLabel(now);
  const { summary, summaryError } = useMemo<{
    summary: DashboardSummary | null;
    summaryError: string | null;
  }>(() => {
    try {
      return {
        summary: summarizeTransactions(
          transactions,
          categories,
          bounds.dateFrom,
          bounds.dateTo
        ),
        summaryError: null,
      };
    } catch (cause) {
      return { summary: null, summaryError: toMessage(cause) };
    }
  }, [transactions, categories, bounds.dateFrom, bounds.dateTo]);

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
        title="Dashboard"
        subtitle="Your money at a glance. Values come from entries on this device."
      />

      {status === 'loading' ? <LoadingView /> : null}
      {status === 'error' ? (
        <ErrorView
          message={error ?? 'Unknown error.'}
          onRetry={() => void refresh()}
        />
      ) : null}
      {status === 'ready' ? (
        <>
          {error ? <ErrorBanner message={error} /> : null}
          {summaryError ? <ErrorBanner message={summaryError} /> : null}
          {summary ? (
            <>
              <View
                style={styles.balanceCard}
                accessible
                accessibilityLabel={`Lifetime net balance ${formatMinorUnits(
                  summary.balanceMinor
                )}`}
              >
                <Text style={styles.cardLabel}>Lifetime net balance</Text>
                <Text style={styles.balanceValue}>
                  {formatMinorUnits(summary.balanceMinor)}
                </Text>
                <Text style={styles.cardHint}>
                  Income minus expenses across all entries
                </Text>
              </View>

              <Text style={styles.sectionTitle} accessibilityRole="header">
                {label}
              </Text>
              <View style={styles.card}>
                <View
                  style={styles.metricRow}
                  accessible
                  accessibilityLabel={`Income this month ${formatMinorUnits(
                    summary.periodIncomeMinor
                  )}`}
                >
                  <Text style={styles.metricLabel}>Income</Text>
                  <Text style={[styles.metricValue, styles.incomeText]}>
                    {formatMinorUnits(summary.periodIncomeMinor)}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View
                  style={styles.metricRow}
                  accessible
                  accessibilityLabel={`Expenses this month ${formatMinorUnits(
                    summary.periodExpenseMinor
                  )}`}
                >
                  <Text style={styles.metricLabel}>Expenses</Text>
                  <Text style={[styles.metricValue, styles.expenseText]}>
                    {formatMinorUnits(summary.periodExpenseMinor)}
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionTitle} accessibilityRole="header">
                Expenses by category
              </Text>
              {summary.expenseByCategory.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>
                    No expenses recorded this month.
                  </Text>
                </View>
              ) : (
                <View style={styles.card}>
                  {summary.expenseByCategory.map((entry) => (
                    <View
                      key={entry.categoryId}
                      style={styles.categoryRow}
                      accessible
                      accessibilityLabel={`${entry.categoryName}: ${formatMinorUnits(
                        entry.amountMinor
                      )}`}
                    >
                      <Text style={styles.categoryName}>{entry.categoryName}</Text>
                      <Text style={styles.categoryAmount}>
                        {formatMinorUnits(entry.amountMinor)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {transactions.length === 0 ? (
                <Text style={styles.emptyHint}>
                  Add a transaction to see your totals here.
                </Text>
              ) : null}
            </>
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
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...elevation,
  },
  cardLabel: {
    fontSize: fontSize.small,
    color: colors.onPrimary,
    opacity: 0.85,
  },
  balanceValue: {
    marginTop: spacing.xs,
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  cardHint: {
    marginTop: spacing.sm,
    fontSize: fontSize.caption,
    color: colors.onPrimary,
    opacity: 0.8,
  },
  sectionTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontSize: fontSize.label,
    fontWeight: '700',
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...elevation,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  metricLabel: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  metricValue: {
    fontSize: fontSize.heading,
    fontWeight: '700',
  },
  incomeText: {
    color: colors.income,
  },
  expenseText: {
    color: colors.expense,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  categoryName: {
    flex: 1,
    fontSize: fontSize.body,
    color: colors.text,
  },
  categoryAmount: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  emptyHint: {
    marginTop: spacing.md,
    fontSize: fontSize.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
