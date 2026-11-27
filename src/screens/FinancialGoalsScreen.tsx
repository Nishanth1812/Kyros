import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GoalCard from '../components/GoalCard';
import ScreenHeader from '../components/ScreenHeader';
import { ErrorBanner, ErrorView, LoadingView } from '../components/StateViews';
import { calculateGoalProgress } from '../lib/goalCalculations';
import { formatMinorUnits, parseAmountToMinorUnits } from '../lib/money';
import type { RootStackParamList } from '../navigation/types';
import type { FinancialGoal } from '../storage/types';
import { useTransactions } from '../state/TransactionsContext';
import { responsivePageContentStyle } from '../theme/layout';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'FinancialGoals'>;

interface ContributionTarget {
  goal: FinancialGoal;
  mode: 'deposit' | 'withdraw';
}

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

export default function FinancialGoalsScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { goals, status, error, refresh, addGoal, deleteGoal, contributeToGoal } =
    useTransactions();

  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contribution, setContribution] = useState<ContributionTarget | null>(null);
  const [title, setTitle] = useState('');
  const [targetRupees, setTargetRupees] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { activeGoals, completedGoals } = useMemo(() => {
    const visible = goals.filter((goal) => goal.status !== 'cancelled');
    return {
      activeGoals: visible.filter((goal) => goal.status === 'active'),
      completedGoals: visible.filter((goal) => goal.status === 'completed'),
    };
  }, [goals]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const openCreateModal = () => {
    setTitle('');
    setTargetRupees('');
    setTargetDate('');
    setFormError(null);
    setShowCreateModal(true);
  };

  const openContribution = (goal: FinancialGoal, mode: 'deposit' | 'withdraw') => {
    setContribution({ goal, mode });
    setAmountRupees('');
    setFormError(null);
  };

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Enter a goal title.');
      return;
    }
    if (trimmedTitle.length > 60) {
      setFormError('Goal titles are limited to 60 characters.');
      return;
    }

    const parsed = parseAmountToMinorUnits(targetRupees);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }

    const trimmedDate = targetDate.trim();
    if (trimmedDate && !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      setFormError('Enter the target date as YYYY-MM-DD, or leave it blank.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await addGoal({
        title: trimmedTitle,
        targetAmountMinor: parsed.amountMinor,
        targetDate: trimmedDate || null,
      });
      setShowCreateModal(false);
    } catch (cause) {
      setFormError(toMessage(cause));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitContribution = async () => {
    if (!contribution) return;

    const parsed = parseAmountToMinorUnits(amountRupees);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    if (
      contribution.mode === 'withdraw' &&
      parsed.amountMinor > contribution.goal.currentSavedMinor
    ) {
      setFormError(
        `You can withdraw up to ${formatMinorUnits(contribution.goal.currentSavedMinor)}.`
      );
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const deltaMinor =
        contribution.mode === 'deposit' ? parsed.amountMinor : -parsed.amountMinor;
      await contributeToGoal(contribution.goal.id, deltaMinor);
      setContribution(null);
    } catch (cause) {
      setFormError(toMessage(cause));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (goal: FinancialGoal) => {
    Alert.alert(
      'Delete goal',
      `Delete "${goal.title}"? Its saved progress will be removed and cannot be recovered.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGoal(goal.id);
            } catch (cause) {
              Alert.alert('Delete failed', toMessage(cause));
            }
          },
        },
      ]
    );
  };

  const renderGoal = (goal: FinancialGoal) => (
    <GoalCard
      key={goal.id}
      goal={goal}
      progress={calculateGoalProgress(goal)}
      onAddSavings={(target) => openContribution(target, 'deposit')}
      onWithdraw={(target) => openContribution(target, 'withdraw')}
      onDelete={handleDelete}
    />
  );

  const hasVisibleGoals = activeGoals.length > 0 || completedGoals.length > 0;

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
      <Pressable
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back to previous screen"
        style={({ pressed }) => [
          styles.backButton,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.backButtonText}>← Back</Text>
      </Pressable>

      <ScreenHeader
        title="Financial Goals"
        subtitle="Set savings targets, track contributions, and see how much to set aside each month."
      />

      {status === 'loading' ? <LoadingView subject="savings goals" /> : null}
      {status === 'error' ? (
        <ErrorView
          message={error ?? 'Unknown error.'}
          onRetry={() => void refresh()}
          subject="savings goals"
        />
      ) : null}
      {status === 'ready' ? (
        <>
          {error ? <ErrorBanner message={error} /> : null}

          <Pressable
            onPress={openCreateModal}
            accessibilityRole="button"
            accessibilityLabel="Create a new savings goal"
            style={({ pressed }) => [
              styles.createButton,
              pressed ? styles.createButtonPressed : null,
            ]}
          >
            <Text style={styles.createButtonText}>＋ New Goal</Text>
          </Pressable>

          {!hasVisibleGoals ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No savings goals yet</Text>
              <Text style={styles.emptyText}>
                Create a goal such as an emergency fund or a trip, then record
                savings as you go. Progress is stored on this device.
              </Text>
            </View>
          ) : null}

          {activeGoals.length > 0 ? (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Active goals
              </Text>
              {activeGoals.map(renderGoal)}
            </>
          ) : null}

          {completedGoals.length > 0 ? (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Completed goals
              </Text>
              {completedGoals.map(renderGoal)}
            </>
          ) : null}
        </>
      ) : null}

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSubmitting) setShowCreateModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>New Savings Goal</Text>

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Emergency fund"
                placeholderTextColor={colors.textMuted}
                maxLength={60}
                editable={!isSubmitting}
                autoFocus
                accessibilityLabel="Goal title"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Target amount (₹)</Text>
              <TextInput
                value={targetRupees}
                onChangeText={setTargetRupees}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                maxLength={18}
                editable={!isSubmitting}
                accessibilityLabel="Target amount in rupees"
                accessibilityHint="Enter an amount in rupees and paise, for example 50000 or 50000.50"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Target date (optional)</Text>
              <TextInput
                value={targetDate}
                onChangeText={setTargetDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                maxLength={10}
                editable={!isSubmitting}
                accessibilityLabel="Target date"
                accessibilityHint="Enter a target date as year dash month dash day, or leave blank"
                style={styles.input}
              />

              {formError ? (
                <Text
                  style={styles.errorText}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  {formError}
                </Text>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel new goal"
                  accessibilityState={{ disabled: isSubmitting }}
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.cancelButton,
                    pressed && !isSubmitting ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleCreate()}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Create goal"
                  accessibilityState={{ disabled: isSubmitting }}
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.saveButton,
                    pressed && !isSubmitting ? styles.saveButtonPressed : null,
                    isSubmitting ? styles.buttonDisabled : null,
                  ]}
                >
                  <Text style={styles.saveButtonText}>
                    {isSubmitting ? 'Creating…' : 'Create'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={contribution !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSubmitting) setContribution(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {contribution?.mode === 'withdraw' ? 'Withdraw Savings' : 'Add Savings'}
              </Text>
              {contribution ? (
                <Text style={styles.modalSubtitle}>
                  {contribution.goal.title} ·{' '}
                  {formatMinorUnits(contribution.goal.currentSavedMinor)} saved of{' '}
                  {formatMinorUnits(contribution.goal.targetAmountMinor)}
                </Text>
              ) : null}

              <Text style={styles.fieldLabel}>Amount (₹)</Text>
              <TextInput
                value={amountRupees}
                onChangeText={setAmountRupees}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                maxLength={18}
                editable={!isSubmitting}
                autoFocus
                accessibilityLabel={
                  contribution?.mode === 'withdraw'
                    ? 'Withdrawal amount in rupees'
                    : 'Savings amount in rupees'
                }
                style={styles.input}
              />
              {contribution?.mode === 'withdraw' ? (
                <Text style={styles.helperText}>
                  Available to withdraw:{' '}
                  {formatMinorUnits(contribution.goal.currentSavedMinor)}
                </Text>
              ) : null}

              {formError ? (
                <Text
                  style={styles.errorText}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  {formError}
                </Text>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setContribution(null)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel contribution"
                  accessibilityState={{ disabled: isSubmitting }}
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.cancelButton,
                    pressed && !isSubmitting ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleSubmitContribution()}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel={
                    contribution?.mode === 'withdraw'
                      ? 'Confirm withdrawal'
                      : 'Confirm savings'
                  }
                  accessibilityState={{ disabled: isSubmitting }}
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.saveButton,
                    pressed && !isSubmitting ? styles.saveButtonPressed : null,
                    isSubmitting ? styles.buttonDisabled : null,
                  ]}
                >
                  <Text style={styles.saveButtonText}>
                    {isSubmitting
                      ? 'Saving…'
                      : contribution?.mode === 'withdraw'
                        ? 'Withdraw'
                        : 'Add savings'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  backButtonText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primary,
  },
  createButton: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...elevation,
  },
  createButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  createButtonText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  sectionTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontSize: fontSize.label,
    fontWeight: '700',
    color: colors.text,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...elevation,
  },
  emptyTitle: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    marginTop: spacing.sm,
    fontSize: fontSize.body,
    lineHeight: 22,
    color: colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...elevation,
  },
  modalTitle: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    fontSize: fontSize.small,
    lineHeight: 20,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
    marginBottom: spacing.md,
  },
  helperText: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.small,
    marginBottom: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalButton: {
    minHeight: 48,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  cancelButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  saveButtonText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.7,
  },
});
