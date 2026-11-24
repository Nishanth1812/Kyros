import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MonthlyTrendDataPoint } from '../lib/analytics';
import { formatMinorUnits } from '../lib/money';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, fontSize, radius, spacing } from '../theme/theme';

export interface MonthlyTrendChartProps {
  trends: MonthlyTrendDataPoint[];
  onSelectMonth?: (point: MonthlyTrendDataPoint) => void;
  selectedMonth?: number; // 1-12
}

const BAR_MAX_HEIGHT = 100;

export default function MonthlyTrendChart({
  trends,
  onSelectMonth,
  selectedMonth,
}: MonthlyTrendChartProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  if (trends.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No monthly history available yet</Text>
      </View>
    );
  }

  // Calculate highest single bar amount to scale heights proportionally
  const maxAmount = Math.max(
    ...trends.map((t) => Math.max(t.incomeMinor, t.expenseMinor)),
    1000
  );

  return (
    <View style={styles.container}>
      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.income }]} />
          <Text style={styles.legendText}>Income</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.expense }]} />
          <Text style={styles.legendText}>Expense</Text>
        </View>
      </View>

      {/* Chart Canvas */}
      <View style={styles.chartCanvas}>
        {trends.map((point) => {
          const isSelected = selectedMonth === point.month;
          const incomeHeight =
            point.incomeMinor > 0
              ? Math.max(4, Math.round((point.incomeMinor / maxAmount) * BAR_MAX_HEIGHT))
              : 0;
          const expenseHeight =
            point.expenseMinor > 0
              ? Math.max(4, Math.round((point.expenseMinor / maxAmount) * BAR_MAX_HEIGHT))
              : 0;

          const accessibilityLabel = `${point.label}: Income ${formatMinorUnits(
            point.incomeMinor
          )}, Expenses ${formatMinorUnits(point.expenseMinor)}, Net ${formatMinorUnits(
            point.netMinor
          )}`;

          return (
            <Pressable
              key={`${point.year}-${point.month}`}
              onPress={() => onSelectMonth?.(point)}
              disabled={!onSelectMonth}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => [
                styles.monthColumn,
                isSelected && styles.monthColumnSelected,
                pressed && onSelectMonth ? styles.monthColumnPressed : null,
              ]}
            >
              {/* Bars Area */}
              <View style={styles.barsContainer}>
                {/* Income Bar */}
                <View
                  style={[
                    styles.bar,
                    styles.incomeBar,
                    { height: incomeHeight },
                  ]}
                />
                {/* Expense Bar */}
                <View
                  style={[
                    styles.bar,
                    styles.expenseBar,
                    { height: expenseHeight },
                  ]}
                />
              </View>

              {/* Month Label */}
              <Text style={[styles.monthLabel, isSelected && styles.monthLabelSelected]}>
                {point.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginTop: spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chartCanvas: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_MAX_HEIGHT + 36,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.xs,
  },
  monthColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: spacing.xs,
    minHeight: 48,
    minWidth: 48,
    borderRadius: radius.sm,
  },
  monthColumnSelected: {
    backgroundColor: colors.subtleGreen,
  },
  monthColumnPressed: {
    opacity: 0.7,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: BAR_MAX_HEIGHT,
    gap: 4,
    width: '100%',
  },
  bar: {
    width: 12,
    borderRadius: radius.pill,
    minHeight: 0,
  },
  incomeBar: {
    backgroundColor: colors.income,
  },
  expenseBar: {
    backgroundColor: colors.expense,
  },
  monthLabel: {
    marginTop: spacing.xs,
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.textMuted,
  },
  monthLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
