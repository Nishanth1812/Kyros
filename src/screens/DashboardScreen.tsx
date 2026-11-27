import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  type CompositeNavigationProp,
  useNavigation,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CategoryBreakdownChart from '../components/CategoryBreakdownChart';
import ScreenHeader from '../components/ScreenHeader';
import { ErrorBanner, ErrorView, LoadingView } from '../components/StateViews';
import {
  calculateMonthAnalytics,
  getMonthScope,
  shiftMonth,
  type MonthScope,
} from '../lib/analytics';
import { formatMinorUnits } from '../lib/money';
import { summarizeTransactions, type DashboardSummary } from '../lib/summaries';
import type { RootStackParamList, RootTabParamList } from '../navigation/types';
import { useTransactions } from '../state/TransactionsContext';
import { responsivePageContentStyle, touchTargetStyle } from '../theme/layout';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';
import RecurringReviewBanner from '../components/RecurringReviewBanner';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

export default function DashboardScreen() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const navigation = useNavigation<Navigation>();
  const { transactions, categories, status, error, refresh } = useTransactions();
  const [refreshing, setRefreshing] = useState(false);

  const currentScope = getMonthScope(new Date());
  const [selectedScope, setSelectedScope] = useState<MonthScope>(currentScope);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const isCurrentMonth =
    selectedScope.year === currentScope.year && selectedScope.month === currentScope.month;

  const { summary, summaryError } = useMemo<{
    summary: DashboardSummary | null;
    summaryError: string | null;
  }>(() => {
    try {
      return {
        summary: summarizeTransactions(
          transactions,
          categories,
          selectedScope.dateFrom,
          selectedScope.dateTo
        ),
        summaryError: null,
      };
    } catch (cause) {
      return { summary: null, summaryError: toMessage(cause) };
    }
  }, [transactions, categories, selectedScope.dateFrom, selectedScope.dateTo]);

  const analytics = useMemo(() => {
    return calculateMonthAnalytics(transactions, categories, selectedScope);
  }, [transactions, categories, selectedScope]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[responsivePageContentStyle, { paddingTop: insets.top + spacing.md }]}
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
        onSettingsPress={() => navigation.navigate('Settings')}
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
              <RecurringReviewBanner
                onReview={() => navigation.navigate('RecurringTransactions')}
              />

              {/* Lifetime Net Balance Card */}
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

              {/* Month Navigation Controls */}
              <View style={styles.monthNav}>
                <Pressable
                  onPress={() => setSelectedScope((prev) => shiftMonth(prev, -1))}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  accessibilityHint="View summary for the previous month"
                  style={({ pressed }) => [
                    styles.navBtn,
                    pressed ? styles.navBtnPressed : null,
                  ]}
                >
                  <Text style={styles.navBtnText}>◀</Text>
                </Pressable>

                <View style={styles.monthCenter}>
                  <Text style={styles.monthTitle} accessibilityRole="header">
                    {selectedScope.label}
                  </Text>
                  {!isCurrentMonth && (
                    <Pressable
                      onPress={() => setSelectedScope(currentScope)}
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel="Reset to current month"
                      style={styles.currentMonthBadge}
                    >
                      <Text style={styles.currentMonthBadgeText}>Return to Current</Text>
                    </Pressable>
                  )}
                </View>

                <Pressable
                  onPress={() => setSelectedScope((prev) => shiftMonth(prev, 1))}
                  disabled={isCurrentMonth}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  accessibilityHint={isCurrentMonth ? 'Disabled, currently on latest month' : 'View summary for the next month'}
                  style={({ pressed }) => [
                    styles.navBtn,
                    isCurrentMonth && styles.navBtnDisabled,
                    pressed && !isCurrentMonth ? styles.navBtnPressed : null,
                  ]}
                >
                  <Text style={[styles.navBtnText, isCurrentMonth && styles.navBtnTextDisabled]}>
                    ▶
                  </Text>
                </Pressable>
              </View>

              {/* Monthly Income and Expense Metrics */}
              <View style={styles.card}>
                <View
                  style={styles.metricRow}
                  accessible
                  accessibilityLabel={`Income for ${selectedScope.label} ${formatMinorUnits(
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
                  accessibilityLabel={`Expenses for ${selectedScope.label} ${formatMinorUnits(
                    summary.periodExpenseMinor
                  )}`}
                >
                  <Text style={styles.metricLabel}>Expenses</Text>
                  <Text style={[styles.metricValue, styles.expenseText]}>
                    {formatMinorUnits(summary.periodExpenseMinor)}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View
                  style={styles.metricRow}
                  accessible
                  accessibilityLabel={`Savings rate for ${selectedScope.label} ${
                    analytics.savingsRate === null
                      ? 'Not available'
                      : `${analytics.savingsRate} percent`
                  }`}
                >
                  <Text style={styles.metricLabel}>Savings Rate</Text>
                  <Text style={[styles.metricValue, styles.savingsText]}>
                    {analytics.savingsRate === null
                      ? 'Not available'
                      : `${analytics.savingsRate}%`}
                  </Text>
                </View>
              </View>

              {/* Insights and Analytics Entry Point */}
              <TouchableOpacity
                style={styles.analyticsEntryCard}
                onPress={() =>
                  navigation.navigate('Analytics', { initialScope: selectedScope })
                }
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Open financial analytics and spending trends"
              >
                <View style={styles.analyticsEntryLeft}>
                  <Text style={styles.analyticsEntryTitle}>Insights & Multi-Month Trends</Text>
                  <Text style={styles.analyticsEntrySubtitle}>
                    Explore 6-month trends, daily spend, and savings rates
                  </Text>
                </View>
                <Text style={styles.analyticsEntryArrow}>➔</Text>
              </TouchableOpacity>

              {/* Category Spending Breakdown Section */}
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Expenses by category ({selectedScope.label})
              </Text>

              <View style={styles.card}>
                <CategoryBreakdownChart
                  breakdown={analytics.categoryBreakdown}
                  totalExpenseMinor={analytics.totalExpenseMinor}
                />
              </View>

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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...elevation,
  },
  cardLabel: {
    color: colors.onPrimary,
    fontSize: fontSize.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  balanceValue: {
    color: colors.onPrimary,
    fontSize: fontSize.title,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  cardHint: {
    color: colors.onPrimary,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
    opacity: 0.8,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.md,
    ...elevation,
  },
  navBtn: {
    ...touchTargetStyle,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  navBtnPressed: {
    backgroundColor: colors.subtleGreen,
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primary,
  },
  navBtnTextDisabled: {
    color: colors.textMuted,
  },
  monthCenter: {
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
  },
  currentMonthBadge: {
    ...touchTargetStyle,
    marginTop: spacing.xs,
    backgroundColor: colors.subtleGreen,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentMonthBadgeText: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...elevation,
  },
  sectionTitle: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
  },
  metricLabel: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  metricValue: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  incomeText: {
    color: colors.income,
  },
  expenseText: {
    color: colors.expense,
  },
  savingsText: {
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  analyticsEntryCard: {
    ...touchTargetStyle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.subtleGreen,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  analyticsEntryLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  analyticsEntryTitle: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primary,
  },
  analyticsEntrySubtitle: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  analyticsEntryArrow: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyHint: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.small,
    marginTop: spacing.md,
  },
});
