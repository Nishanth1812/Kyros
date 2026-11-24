import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenHeader from '../components/ScreenHeader';
import { formatMinorUnits, parseAmountToMinorUnits } from '../lib/money';
import { formatFrequency } from '../lib/recurringEngine';
import { useTransactions } from '../state/TransactionsContext';
import type { RecurringFrequency, RecurringTransaction, TransactionType } from '../storage/types';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';

interface RecurringTransactionsScreenProps {
  onBack?: () => void;
}

const FREQUENCIES: RecurringFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

export default function RecurringTransactionsScreen({ onBack }: RecurringTransactionsScreenProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { recurring, activeCategories, addRecurring, deleteRecurring, toggleRecurringActive, applyRecurring } =
    useTransactions();

  const [showAddModal, setShowAddModal] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [amountRupees, setAmountRupees] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const categoriesForType = useMemo(
    () => activeCategories.filter((c) => c.type === type),
    [activeCategories, type]
  );

  const getCategoryName = (catId: number) => {
    return activeCategories.find((c) => c.id === catId)?.name ?? 'Unknown';
  };

  const handleOpenAddModal = () => {
    setType('expense');
    setAmountRupees('');
    setCategoryId(categoriesForType[0]?.id ?? null);
    setFrequency('monthly');
    setNextDueDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setErrorMessage(null);
    setShowAddModal(true);
  };

  const handleCreate = async () => {
    const parseRes = parseAmountToMinorUnits(amountRupees);
    if (!parseRes.ok) {
      setErrorMessage(parseRes.error);
      return;
    }
    const amountMinor = parseRes.amountMinor;
    if (amountMinor <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0.');
      return;
    }
    const selectedCat = categoryId ?? categoriesForType[0]?.id;
    if (!selectedCat) {
      setErrorMessage('Please select a category.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
      setErrorMessage('Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await addRecurring({
        amountMinor,
        type,
        categoryId: selectedCat,
        frequency,
        nextDueDate,
        description: description.trim() || undefined,
        isActive: true,
      });
      setShowAddModal(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create recurring schedule.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApply = async (item: RecurringTransaction) => {
    try {
      const result = await applyRecurring(item.id);
      Alert.alert(
        'Transaction Recorded',
        `Successfully recorded ${formatMinorUnits(result.transaction.amountMinor)}. Next due date is ${result.nextDueDate}.`
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not apply recurring transaction.');
    }
  };

  const handleTogglePause = async (item: RecurringTransaction) => {
    try {
      await toggleRecurringActive(item.id, !item.isActive);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not update status.');
    }
  };

  const handleDelete = (item: RecurringTransaction) => {
    Alert.alert(
      'Delete Recurring Schedule',
      `Are you sure you want to delete this ${formatFrequency(item.frequency).toLowerCase()} schedule? Past transactions will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecurring(item.id);
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete schedule.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {onBack && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Dashboard"
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      )}

      <ScreenHeader
        title="Recurring Schedules"
        subtitle="Set up recurring expenses and income (rent, salary, bills) with automatic due-date reminders."
      />

      <TouchableOpacity
        style={styles.createButton}
        onPress={handleOpenAddModal}
        accessibilityRole="button"
        accessibilityLabel="Create new recurring schedule"
      >
        <Text style={styles.createButtonText}>＋ New Recurring Schedule</Text>
      </TouchableOpacity>

      {recurring.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No recurring schedules yet</Text>
          <Text style={styles.emptySubtitle}>
            Add recurring entries like monthly rent, subscriptions, or salaries to streamline tracking.
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {recurring.map((item) => (
            <View key={item.id} style={styles.scheduleCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.headerLeft}>
                  <Text style={styles.cardTitle}>{item.description || getCategoryName(item.categoryId)}</Text>
                  <Text style={styles.categorySubtext}>
                    {getCategoryName(item.categoryId)} · {item.type === 'expense' ? 'Expense' : 'Income'}
                  </Text>
                </View>
                <Text style={[styles.amountText, item.type === 'expense' ? styles.expenseText : styles.incomeText]}>
                  {item.type === 'expense' ? '-' : '+'}
                  {formatMinorUnits(item.amountMinor)}
                </Text>
              </View>

              <View style={styles.badgesRow}>
                <View style={styles.frequencyBadge}>
                  <Text style={styles.frequencyBadgeText}>{formatFrequency(item.frequency)}</Text>
                </View>

                <View style={[styles.statusBadge, item.isActive ? styles.activeBadge : styles.pausedBadge]}>
                  <Text style={[styles.statusBadgeText, item.isActive ? styles.activeBadgeText : styles.pausedBadgeText]}>
                    {item.isActive ? 'Active' : 'Paused'}
                  </Text>
                </View>

                <Text style={styles.dueText}>Next due: {item.nextDueDate}</Text>
              </View>

              <View style={styles.cardActionsRow}>
                <TouchableOpacity
                  style={[styles.cardBtn, styles.applyBtn]}
                  onPress={() => handleApply(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Apply recurring payment of ${formatMinorUnits(item.amountMinor)} now`}
                >
                  <Text style={styles.applyBtnText}>Apply Now</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cardBtn, styles.secondaryBtn]}
                  onPress={() => handleTogglePause(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.isActive ? 'Pause' : 'Resume'} recurring schedule`}
                >
                  <Text style={styles.secondaryBtnText}>{item.isActive ? 'Pause' : 'Resume'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cardBtn, styles.dangerBtn]}
                  onPress={() => handleDelete(item)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete recurring schedule"
                >
                  <Text style={styles.dangerBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Add Recurring Modal */}
      {showAddModal && (
        <Modal visible={true} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalHeading}>New Recurring Schedule</Text>

                {/* Type Selection */}
                <View style={styles.typeRow}>
                  <Pressable
                    style={[styles.typeSelectBtn, type === 'expense' && styles.typeSelectBtnActive]}
                    onPress={() => {
                      setType('expense');
                      const cats = activeCategories.filter((c) => c.type === 'expense');
                      setCategoryId(cats[0]?.id ?? null);
                    }}
                  >
                    <Text style={[styles.typeSelectText, type === 'expense' && styles.typeSelectTextActive]}>
                      Expense
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.typeSelectBtn, type === 'income' && styles.typeSelectBtnActive]}
                    onPress={() => {
                      setType('income');
                      const cats = activeCategories.filter((c) => c.type === 'income');
                      setCategoryId(cats[0]?.id ?? null);
                    }}
                  >
                    <Text style={[styles.typeSelectText, type === 'income' && styles.typeSelectTextActive]}>
                      Income
                    </Text>
                  </Pressable>
                </View>

                {/* Amount in Rupees */}
                <Text style={styles.fieldLabel}>Amount (₹)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={amountRupees}
                  onChangeText={setAmountRupees}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Recurring amount input"
                />

                {/* Frequency */}
                <Text style={styles.fieldLabel}>Frequency</Text>
                <View style={styles.freqRow}>
                  {FREQUENCIES.map((freq) => (
                    <Pressable
                      key={freq}
                      style={[styles.freqChip, frequency === freq && styles.freqChipActive]}
                      onPress={() => setFrequency(freq)}
                    >
                      <Text style={[styles.freqChipText, frequency === freq && styles.freqChipTextActive]}>
                        {formatFrequency(freq)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Category Picker */}
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.categoryPickerRow}>
                  {categoriesForType.map((cat) => (
                    <Pressable
                      key={cat.id}
                      style={[styles.categoryChip, (categoryId ?? categoriesForType[0]?.id) === cat.id && styles.categoryChipActive]}
                      onPress={() => setCategoryId(cat.id)}
                    >
                      <Text style={[styles.categoryChipText, (categoryId ?? categoriesForType[0]?.id) === cat.id && styles.categoryChipTextActive]}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Next Due Date */}
                <Text style={styles.fieldLabel}>Next Due Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={nextDueDate}
                  onChangeText={setNextDueDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Next due date"
                />

                {/* Description */}
                <Text style={styles.fieldLabel}>Description (Optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Netflix, Apartment Rent"
                  placeholderTextColor={colors.textMuted}
                  maxLength={120}
                  accessibilityLabel="Optional description"
                />

                {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

                <View style={styles.modalActionsRow}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalCancelBtn]}
                    onPress={() => setShowAddModal(false)}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.modalCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalSaveBtn]}
                    onPress={handleCreate}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.modalSaveBtnText}>{isSubmitting ? 'Saving...' : 'Create'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
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
  createButtonText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation,
  },
  emptyTitle: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  listContainer: {
    gap: spacing.md,
  },
  scheduleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  categorySubtext: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  amountText: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  expenseText: {
    color: colors.expense,
  },
  incomeText: {
    color: colors.income,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  frequencyBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  frequencyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  activeBadge: {
    backgroundColor: '#DCFCE7',
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  pausedBadge: {
    backgroundColor: '#F1F5F9',
  },
  pausedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  dueText: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginLeft: 'auto',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  cardBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  applyBtn: {
    backgroundColor: '#D97706',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  dangerBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  dangerBtnText: {
    color: colors.expense,
    fontSize: fontSize.caption,
    fontWeight: '600',
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
  modalHeading: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeSelectBtn: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeSelectBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeSelectText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  typeSelectTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 4,
  },
  modalInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
    marginBottom: spacing.md,
  },
  freqRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  freqChip: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
  },
  freqChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  freqChipText: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  freqChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  categoryPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  categoryChip: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: fontSize.caption,
    color: colors.text,
  },
  categoryChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  errorText: {
    color: colors.expense,
    fontSize: fontSize.caption,
    marginBottom: spacing.sm,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalBtn: {
    minHeight: 48,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  modalSaveBtn: {
    backgroundColor: colors.primary,
  },
  modalSaveBtnText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
