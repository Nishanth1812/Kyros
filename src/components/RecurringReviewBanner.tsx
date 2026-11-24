import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatMinorUnits } from '../lib/money';
import { useTransactions } from '../state/TransactionsContext';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';

interface RecurringReviewBannerProps {
  onReview?: () => void;
}

export default function RecurringReviewBanner({ onReview }: RecurringReviewBannerProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { dueRecurring, applyAllDueRecurring } = useTransactions();
  const [isApplying, setIsApplying] = useState(false);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  if (dueRecurring.length === 0 && !successFeedback) {
    return null;
  }

  const totalDueMinor = dueRecurring.reduce((sum, item) => sum + item.amountMinor, 0);

  const handleApplyAll = async () => {
    setIsApplying(true);
    try {
      const count = await applyAllDueRecurring();
      setSuccessFeedback(`Applied ${count} recurring ${count === 1 ? 'transaction' : 'transactions'}!`);
      setTimeout(() => setSuccessFeedback(null), 3500);
    } catch {
      // Handled through context error
    } finally {
      setIsApplying(false);
    }
  };

  if (successFeedback) {
    return (
      <View style={[styles.container, styles.successContainer]}>
        <Text style={styles.successText}>✓ {successFeedback}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="summary"
      accessibilityLabel={`${dueRecurring.length} recurring transactions due totaling ${formatMinorUnits(totalDueMinor)}`}
    >
      <View style={styles.infoRow}>
        <Text style={styles.badge}>DUE</Text>
        <Text style={styles.title}>
          {dueRecurring.length} recurring {dueRecurring.length === 1 ? 'payment' : 'payments'} due
        </Text>
      </View>

      <Text style={styles.amountText}>Total: {formatMinorUnits(totalDueMinor)}</Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.applyButton, isApplying && styles.disabledButton]}
          onPress={handleApplyAll}
          disabled={isApplying}
          accessibilityRole="button"
          accessibilityLabel="Apply all due recurring transactions"
        >
          {isApplying ? (
            <ActivityIndicator size="small" color={colors.warning} />
          ) : (
            <Text style={styles.applyButtonText}>Apply All</Text>
          )}
        </TouchableOpacity>

        {onReview && (
          <TouchableOpacity
            style={styles.reviewButton}
            onPress={onReview}
            accessibilityRole="button"
            accessibilityLabel="Review recurring transactions"
          >
            <Text style={styles.reviewButtonText}>Manage</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.subtleWarning,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...elevation,
  },
  successContainer: {
    backgroundColor: colors.subtleGreen,
    borderColor: colors.income,
  },
  successText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.income,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  badge: {
    backgroundColor: colors.subtleWarning,
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  title: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  amountText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  applyButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.subtleWarning,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  applyButtonText: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  reviewButton: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewButtonText: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
