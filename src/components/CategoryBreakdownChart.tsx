import { StyleSheet, Text, View } from 'react-native';

import type { CategorySpendingBreakdown } from '../lib/analytics';
import { formatMinorUnits } from '../lib/money';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, fontSize, radius, spacing } from '../theme/theme';

const PALETTE = [
  '#0B3D2E', // Primary Forest Green
  '#1B7A54', // Emerald Income Green
  '#F2B544', // Warm Gold
  '#B24135', // Crimson Expense Red
  '#2B5E7C', // Slate Blue
  '#7D3C98', // Royal Purple
  '#D35400', // Rust Orange
  '#566573', // Charcoal Gray
];

export interface CategoryBreakdownChartProps {
  breakdown: CategorySpendingBreakdown[];
  totalExpenseMinor: number;
}

export default function CategoryBreakdownChart({
  breakdown,
  totalExpenseMinor,
}: CategoryBreakdownChartProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  if (breakdown.length === 0 || totalExpenseMinor === 0) {
    return (
      <View
        style={styles.emptyContainer}
        accessible={true}
        accessibilityLabel="No expenses recorded for this period"
      >
        <Text style={styles.emptyText}>No expenses recorded for this month</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Proportional Segmented Bar */}
      <View
        style={styles.segmentedBar}
        accessible={true}
        accessibilityRole="image"
        accessibilityLabel={`Spending distribution across ${breakdown.length} categories`}
      >
        {breakdown.map((item, index) => {
          const color = PALETTE[index % PALETTE.length];
          const flex = Math.max(item.percentage, 2);
          return (
            <View
              key={item.categoryId}
              style={[
                styles.segment,
                { backgroundColor: color, flex },
                index === 0 && styles.firstSegment,
                index === breakdown.length - 1 && styles.lastSegment,
              ]}
            />
          );
        })}
      </View>

      {/* Ranked Category List */}
      <View style={styles.list}>
        {breakdown.map((item, index) => {
          const color = PALETTE[index % PALETTE.length];
          const accessibilityLabel = `${item.name}: ${item.percentage} percent of expenses, ${formatMinorUnits(item.amountMinor)}`;

          return (
            <View
              key={item.categoryId}
              style={styles.categoryRow}
              accessible={true}
              accessibilityRole="summary"
              accessibilityLabel={accessibilityLabel}
            >
              <View style={styles.categoryLeft}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text style={styles.categoryName} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>

              <View style={styles.categoryRight}>
                <Text style={styles.percentageText}>{item.percentage}%</Text>
                <Text style={styles.amountText}>{formatMinorUnits(item.amountMinor)}</Text>
              </View>
            </View>
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
  segmentedBar: {
    height: 14,
    flexDirection: 'row',
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  segment: {
    height: '100%',
  },
  firstSegment: {
    borderTopLeftRadius: radius.pill,
    borderBottomLeftRadius: radius.pill,
  },
  lastSegment: {
    borderTopRightRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
  },
  list: {
    gap: spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    minHeight: 36,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  categoryName: {
    fontSize: fontSize.body,
    fontWeight: '500',
    color: colors.text,
    flexShrink: 1,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  percentageText: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textMuted,
    minWidth: 38,
    textAlign: 'right',
  },
  amountText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
    minWidth: 80,
    textAlign: 'right',
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
