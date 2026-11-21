import { StyleSheet, Text, View } from 'react-native';

import { formatDisplayDate } from '../lib/dates';
import { formatMinorUnits } from '../lib/money';
import type { Transaction } from '../storage';
import { colors, elevation, fontSize, radius, spacing } from '../theme/theme';

export default function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isIncome = transaction.type === 'income';
  const amountText = `${isIncome ? '+' : '−'} ${formatMinorUnits(transaction.amountMinor)}`;
  const readableDate = formatDisplayDate(transaction.date);
  const label = `${isIncome ? 'Income' : 'Expense'} of ${formatMinorUnits(
    transaction.amountMinor
  )} on ${readableDate}${transaction.description ? `, ${transaction.description}` : ''}`;

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={label}
    >
      <View style={styles.badge}>
        <Text
          style={[styles.badgeText, isIncome ? styles.badgeIncome : styles.badgeExpense]}
        >
          {isIncome ? 'INCOME' : 'EXPENSE'}
        </Text>
      </View>
      <View style={styles.details}>
        <Text
          style={[styles.amount, isIncome ? styles.amountIncome : styles.amountExpense]}
        >
          {amountText}
        </Text>
        <Text style={styles.date}>{readableDate}</Text>
        {transaction.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {transaction.description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...elevation,
  },
  badge: {
    marginRight: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  badgeText: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeIncome: { color: colors.income },
  badgeExpense: { color: colors.expense },
  details: {
    flex: 1,
  },
  amount: {
    fontSize: fontSize.heading,
    fontWeight: '700',
  },
  amountIncome: { color: colors.income },
  amountExpense: { color: colors.expense },
  date: {
    marginTop: spacing.xs,
    fontSize: fontSize.small,
    color: colors.textMuted,
  },
  description: {
    marginTop: spacing.xs,
    fontSize: fontSize.body,
    color: colors.text,
  },
});
