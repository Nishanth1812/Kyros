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

export interface TrendScale {
  /** Amount represented by a full-height bar; zero when there is no activity. */
  maxMinor: number;
  /** Visible axis caption so the bars have a stated reference value. */
  label: string;
  /** True when every month has zero income and zero expense. */
  isEmpty: boolean;
}

/** Round up to the nearest 1, 2, 5 or 10 times a power of ten. */
export function getTrendScale(trends: MonthlyTrendDataPoint[]): TrendScale {
  const peak = trends.reduce(
    (highest, point) => Math.max(highest, point.incomeMinor, point.expenseMinor),
    0
  );

  if (peak <= 0) {
    return {
      maxMinor: 0,
      label: 'No income or expenses in the last 6 months',
      isEmpty: true,
    };
  }

  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const normalized = peak / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const maxMinor = Math.round(step * magnitude);

  return {
    maxMinor,
    label: `Scale: ${formatMinorUnits(0)} – ${formatMinorUnits(maxMinor)}`,
    isEmpty: false,
  };
}

/** Height in pixels for one bar, measured against the shared, stated scale. */
export function getBarHeight(amountMinor: number, scale: TrendScale): number {
  if (amountMinor <= 0 || scale.maxMinor <= 0) return 0;
  return Math.min(BAR_MAX_HEIGHT, Math.round((amountMinor / scale.maxMinor) * BAR_MAX_HEIGHT));
}

/** Exact values for TalkBack; colour never carries the amounts on its own. */
export function formatTrendAccessibilityLabel(point: MonthlyTrendDataPoint): string {
  return `${point.label}: Income ${formatMinorUnits(
    point.incomeMinor
  )}, Expenses ${formatMinorUnits(point.expenseMinor)}, Net ${formatMinorUnits(
    point.netMinor
  )}`;
}

export default function MonthlyTrendChart({
  trends,
  onSelectMonth,
  selectedMonth,
}: MonthlyTrendChartProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  if (trends.length === 0) {
    return (
      <View
        style={styles.emptyContainer}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel="No monthly history available yet"
      >
        <Text style={styles.emptyText}>No monthly history available yet</Text>
      </View>
    );
  }

  const scale = getTrendScale(trends);

  return (
    <View style={styles.container}>
      {/* Legend: both series are named in text, not only by colour. */}
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

      {scale.isEmpty ? (
        <View
          style={styles.emptyBanner}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={scale.label}
        >
          <Text style={styles.emptyText}>{scale.label}</Text>
        </View>
      ) : (
        <Text style={styles.scaleText} accessibilityRole="text">
          {scale.label}
        </Text>
      )}

      {/* Chart Canvas */}
      <View style={styles.chartCanvas}>
        {trends.map((point) => {
          const isSelected = selectedMonth === point.month;
          const incomeHeight = getBarHeight(point.incomeMinor, scale);
          const expenseHeight = getBarHeight(point.expenseMinor, scale);

          return (
            <Pressable
              key={`${point.year}-${point.month}`}
              onPress={() => onSelectMonth?.(point)}
              disabled={!onSelectMonth}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={formatTrendAccessibilityLabel(point)}
              accessibilityHint={
                onSelectMonth ? 'Shows this month in the summary below' : undefined
              }
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
    marginBottom: spacing.xs,
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
  scaleText: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  emptyBanner: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
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
