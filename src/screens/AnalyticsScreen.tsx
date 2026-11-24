import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import CategoryBreakdownChart from '../components/CategoryBreakdownChart';
import MonthlyTrendChart from '../components/MonthlyTrendChart';
import {
  calculateMonthAnalytics,
  calculateMultiMonthTrends,
  getMonthScope,
  shiftMonth,
  type MonthScope,
} from '../lib/analytics';
import { formatMinorUnits } from '../lib/money';
import { useTransactions } from '../state/TransactionsContext';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';

export interface AnalyticsScreenProps {
  visible?: boolean;
  onClose?: () => void;
  initialScope?: MonthScope;
}

export default function AnalyticsScreen({
  visible = true,
  onClose,
  initialScope,
}: AnalyticsScreenProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { transactions, categories } = useTransactions();
  const currentScope = getMonthScope(new Date());
  const [scope, setScope] = useState<MonthScope>(() => initialScope ?? currentScope);

  const analytics = calculateMonthAnalytics(transactions, categories, scope);
  const trends = calculateMultiMonthTrends(transactions, 6, new Date(scope.year, scope.month - 1, 1));

  const isCurrentMonth = scope.year === currentScope.year && scope.month === currentScope.month;

  const content = (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title} accessibilityRole="header">
            Financial Analytics
          </Text>
          <Text style={styles.subtitle}>Historical trends and spending insights</Text>
        </View>
        {onClose && (
          <Pressable
            onPress={onClose}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Close analytics"
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? styles.closeButtonPressed : null,
            ]}
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Month Selector Bar */}
        <View style={styles.monthNavCard}>
          <Pressable
            onPress={() => setScope((prev) => shiftMonth(prev, -1))}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            accessibilityHint="Navigates to the previous calendar month"
            style={({ pressed }) => [
              styles.navButton,
              pressed ? styles.navButtonPressed : null,
            ]}
          >
            <Text style={styles.navArrow}>◀</Text>
          </Pressable>

          <View style={styles.monthLabelContainer}>
            <Text style={styles.monthLabelText}>{scope.label}</Text>
            {!isCurrentMonth && (
              <Pressable
                onPress={() => setScope(currentScope)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Jump to current month"
                style={styles.todayPill}
              >
                <Text style={styles.todayPillText}>Current Month</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => setScope((prev) => shiftMonth(prev, 1))}
            disabled={isCurrentMonth}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityHint={isCurrentMonth ? 'Disabled, currently on latest month' : 'Navigates to the next calendar month'}
            style={({ pressed }) => [
              styles.navButton,
              isCurrentMonth && styles.navButtonDisabled,
              pressed && !isCurrentMonth ? styles.navButtonPressed : null,
            ]}
          >
            <Text style={[styles.navArrow, isCurrentMonth && styles.navArrowDisabled]}>
              ▶
            </Text>
          </Pressable>
        </View>

        {/* 6-Month Trend Overview */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>6-Month Spending & Income Trend</Text>
          <Text style={styles.cardSubtitle}>
            Compare your financial trajectory over the last 6 months
          </Text>
          <MonthlyTrendChart
            trends={trends}
            selectedMonth={scope.month}
            onSelectMonth={(point) => {
              setScope(getMonthScope(new Date(point.year, point.month - 1, 1)));
            }}
          />
        </View>

        {/* Key Month Metrics Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {formatMinorUnits(analytics.dailyAverageExpenseMinor)}
            </Text>
            <Text style={styles.statLabel}>Daily Avg Spend</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statValue}>{analytics.savingsRate}%</Text>
            <Text style={styles.statLabel}>Savings Rate</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statValue} numberOfLines={1}>
              {analytics.topExpenseCategory ? analytics.topExpenseCategory.name : '—'}
            </Text>
            <Text style={styles.statLabel}>Top Category</Text>
          </View>
        </View>

        {/* Selected Month Income vs Expense Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{scope.label} Summary</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Income</Text>
              <Text style={[styles.summaryAmount, styles.incomeColor]}>
                +{formatMinorUnits(analytics.totalIncomeMinor)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Expenses</Text>
              <Text style={[styles.summaryAmount, styles.expenseColor]}>
                −{formatMinorUnits(analytics.totalExpenseMinor)}
              </Text>
            </View>
          </View>
        </View>

        {/* Category Breakdown Proportional Chart */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Category Spending Distribution</Text>
          <Text style={styles.cardSubtitle}>
            Percentage and amounts spent by category in {scope.label}
          </Text>
          <CategoryBreakdownChart
            breakdown={analytics.categoryBreakdown}
            totalExpenseMinor={analytics.totalExpenseMinor}
          />
        </View>
      </ScrollView>
    </View>
  );

  if (onClose) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        {content}
      </Modal>
    );
  }

  return content;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  closeText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  monthNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    ...elevation,
  },
  navButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  navButtonPressed: {
    backgroundColor: colors.subtleGreen,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navArrow: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primary,
  },
  navArrowDisabled: {
    color: colors.textMuted,
  },
  monthLabelContainer: {
    alignItems: 'center',
  },
  monthLabelText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  todayPill: {
    marginTop: 4,
    backgroundColor: colors.subtleGreen,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  todayPillText: {
    fontSize: 10,
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
  cardTitle: {
    fontSize: fontSize.label,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    ...elevation,
  },
  statValue: {
    fontSize: fontSize.label,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: spacing.xs,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  summaryLabel: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: fontSize.heading,
    fontWeight: '700',
  },
  incomeColor: {
    color: colors.income,
  },
  expenseColor: {
    color: colors.expense,
  },
});
