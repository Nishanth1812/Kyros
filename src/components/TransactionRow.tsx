import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDisplayDate } from '../lib/dates';
import { formatMinorUnits } from '../lib/money';
import type { Transaction } from '../storage';
import { colors, elevation, fontSize, radius, spacing } from '../theme/theme';

export default function TransactionRow({
  transaction,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const isIncome = transaction.type === 'income';
  const amountText = `${isIncome ? '+' : '−'} ${formatMinorUnits(transaction.amountMinor)}`;
  const readableDate = formatDisplayDate(transaction.date);
  const label = `${isIncome ? 'Income' : 'Expense'} of ${formatMinorUnits(
    transaction.amountMinor
  )} on ${readableDate}${transaction.description ? `, ${transaction.description}` : ''}`;

  return (
    <View style={styles.card}>
      <View style={styles.info} accessible accessibilityLabel={label}>
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
      <View style={styles.actions}>
        <Pressable
          onPress={() => onEdit(transaction)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${label}`}
          accessibilityHint="Opens the edit form for this transaction"
          style={({ pressed }) => [
            styles.actionButton,
            pressed ? styles.actionPressed : null,
          ]}
        >
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={() => onDelete(transaction)}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${label}`}
          accessibilityHint="Asks for confirmation before deleting this transaction"
          style={({ pressed }) => [
            styles.actionButton,
            styles.deleteButton,
            pressed ? styles.actionPressed : null,
          ]}
        >
          <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
        </Pressable>
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
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  actions: {
    marginLeft: spacing.sm,
    flexDirection: 'column',
    gap: spacing.xs,
    flexShrink: 0,
  },
  actionButton: {
    minHeight: 44,
    minWidth: 64,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  deleteButton: {
    borderColor: colors.danger,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.primary,
  },
  deleteText: {
    color: colors.danger,
  },
});
