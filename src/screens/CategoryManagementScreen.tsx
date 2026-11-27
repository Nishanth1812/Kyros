import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenHeader from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { useTransactions } from '../state/TransactionsContext';
import { responsivePageContentStyle } from '../theme/layout';
import type { Category, TransactionType } from '../storage/types';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CategoryManagement'>;

export default function CategoryManagementScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { categories, transactions, renameCategory, archiveCategory, deleteCategory, addCategory } =
    useTransactions();

  const [selectedType, setSelectedType] = useState<TransactionType>('expense');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New category creation
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => c.type === selectedType);
  }, [categories, selectedType]);

  const targetCategoryOptions = useMemo(() => {
    if (!deletingCategory) return [];
    return categories.filter(
      (c) => c.type === deletingCategory.type && c.id !== deletingCategory.id && !c.isArchived
    );
  }, [categories, deletingCategory]);

  const transactionsCountForCategory = (categoryId: number) => {
    return transactions.filter((t) => t.categoryId === categoryId).length;
  };

  const handleStartRename = (cat: Category) => {
    setEditingCategory(cat);
    setEditName(cat.name);
    setErrorMessage(null);
  };

  const handleSaveRename = async () => {
    if (!editingCategory) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setErrorMessage('Category name cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await renameCategory(editingCategory.id, trimmed);
      setEditingCategory(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to rename category.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleArchive = async (cat: Category) => {
    try {
      await archiveCategory(cat.id, !cat.isArchived);
    } catch (err) {
      Alert.alert('Action Failed', err instanceof Error ? err.message : 'Could not change archive status.');
    }
  };

  const handleStartDelete = (cat: Category) => {
    setDeletingCategory(cat);
    const available = categories.filter(
      (c) => c.type === cat.type && c.id !== cat.id && !c.isArchived
    );
    setTargetCategoryId(available[0]?.id ?? null);
    setErrorMessage(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    const txCount = transactionsCountForCategory(deletingCategory.id);
    if (txCount > 0 && targetCategoryId === null) {
      setErrorMessage('Please select a target category to reassign existing transactions.');
      return;
    }
    const targetId = targetCategoryId ?? targetCategoryOptions[0]?.id;
    if (!targetId) {
      setErrorMessage('Cannot delete category: no active replacement category available.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await deleteCategory(deletingCategory.id, targetId);
      setDeletingCategory(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete category.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      setErrorMessage('Category name cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await addCategory({ type: selectedType, name: trimmed });
      setNewCatName('');
      setShowAddModal(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create category.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[responsivePageContentStyle, { paddingTop: insets.top + spacing.md }]}
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back to previous screen"
      >
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <ScreenHeader
        title="Category Management"
        subtitle="Manage custom categories, rename labels, archive inactive items, or delete with atomic reassignment."
      />

      {/* Type Selector Chips */}
      <View style={styles.typeSelectorRow}>
        <Pressable
          style={[styles.typeChip, selectedType === 'expense' && styles.typeChipActive]}
          onPress={() => setSelectedType('expense')}
          accessibilityRole="tab"
          accessibilityLabel="Expense Categories"
          accessibilityState={{ selected: selectedType === 'expense' }}
        >
          <Text style={[styles.typeChipText, selectedType === 'expense' && styles.typeChipTextActive]}>
            Expense Categories
          </Text>
        </Pressable>

        <Pressable
          style={[styles.typeChip, selectedType === 'income' && styles.typeChipActive]}
          onPress={() => setSelectedType('income')}
          accessibilityRole="tab"
          accessibilityLabel="Income Categories"
          accessibilityState={{ selected: selectedType === 'income' }}
        >
          <Text style={[styles.typeChipText, selectedType === 'income' && styles.typeChipTextActive]}>
            Income Categories
          </Text>
        </Pressable>
      </View>

      {/* Add New Category Action */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => {
          setNewCatName('');
          setErrorMessage(null);
          setShowAddModal(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Add new ${selectedType} category`}
      >
        <Text style={styles.addButtonText}>＋ Add {selectedType === 'expense' ? 'Expense' : 'Income'} Category</Text>
      </TouchableOpacity>

      {/* Category List */}
      <View style={styles.listCard}>
        {filteredCategories.map((cat) => {
          const txCount = transactionsCountForCategory(cat.id);
          return (
            <View key={cat.id} style={styles.categoryRow}>
              <View style={styles.categoryInfo}>
                <View style={styles.nameBadgeRow}>
                  <Text style={styles.categoryName}>{cat.name}</Text>
                  {cat.isBuiltin ? (
                    <View style={styles.builtinBadge}>
                      <Text style={styles.builtinBadgeText}>Built-in</Text>
                    </View>
                  ) : cat.isArchived ? (
                    <View style={styles.archivedBadge}>
                      <Text style={styles.archivedBadgeText}>Archived</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.categoryDetail}>
                  {txCount} {txCount === 1 ? 'transaction' : 'transactions'} linked
                </Text>
              </View>

              {!cat.isBuiltin && (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleStartRename(cat)}
                    accessibilityRole="button"
                    accessibilityLabel={`Rename category ${cat.name}`}
                  >
                    <Text style={styles.actionBtnText}>Rename</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, cat.isArchived ? styles.unarchiveBtn : styles.archiveBtn]}
                    onPress={() => handleToggleArchive(cat)}
                    accessibilityRole="button"
                    accessibilityLabel={`${cat.isArchived ? 'Unarchive' : 'Archive'} category ${cat.name}`}
                  >
                    <Text style={styles.actionBtnText}>{cat.isArchived ? 'Unarchive' : 'Archive'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => handleStartDelete(cat)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete category ${cat.name}`}
                  >
                    <Text style={[styles.actionBtnText, styles.deleteBtnText]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Rename Modal */}
      {editingCategory && (
        <Modal visible={true} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Rename Category</Text>
              <Text style={styles.modalSubtitle}>Renaming updates all linked transactions and budget limits.</Text>

              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Category Name"
                placeholderTextColor={colors.textMuted}
                autoFocus={true}
                accessibilityLabel="New category name input"
              />

              {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.cancelBtn]}
                  onPress={() => setEditingCategory(null)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.saveBtn]}
                  onPress={handleSaveRename}
                  disabled={isSubmitting}
                >
                  <Text style={styles.saveBtnText}>{isSubmitting ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Delete with Reassignment Modal */}
      {deletingCategory && (
        <Modal visible={true} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Delete Category: {deletingCategory.name}</Text>
              {transactionsCountForCategory(deletingCategory.id) > 0 ? (
                <>
                  <Text style={styles.modalSubtitle}>
                    This category is used in {transactionsCountForCategory(deletingCategory.id)} transactions. To
                    prevent orphaned records, choose an active category to reassign them to:
                  </Text>
                  <View style={styles.pickerBox}>
                    {targetCategoryOptions.map((opt) => (
                      <Pressable
                        key={opt.id}
                        style={[styles.pickerItem, targetCategoryId === opt.id && styles.pickerItemActive]}
                        onPress={() => setTargetCategoryId(opt.id)}
                        accessibilityRole="radio"
                        accessibilityLabel={`Reassign to ${opt.name}`}
                        accessibilityState={{ checked: targetCategoryId === opt.id }}
                      >
                        <Text style={[styles.pickerItemText, targetCategoryId === opt.id && styles.pickerItemTextActive]}>
                          {opt.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.modalSubtitle}>
                  This category has no linked transactions. It will be removed immediately.
                </Text>
              )}

              {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.cancelBtn]}
                  onPress={() => setDeletingCategory(null)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.dangerBtn]}
                  onPress={handleConfirmDelete}
                  disabled={isSubmitting}
                >
                  <Text style={styles.dangerBtnText}>{isSubmitting ? 'Deleting...' : 'Delete & Reassign'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Add New Category Modal */}
      {showAddModal && (
        <Modal visible={true} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add {selectedType === 'expense' ? 'Expense' : 'Income'} Category</Text>

              <TextInput
                style={styles.input}
                value={newCatName}
                onChangeText={setNewCatName}
                placeholder="Category name (e.g. Subscriptions)"
                placeholderTextColor={colors.textMuted}
                autoFocus={true}
                accessibilityLabel="New category name"
              />

              {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.cancelBtn]}
                  onPress={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.saveBtn]}
                  onPress={handleCreateCategory}
                  disabled={isSubmitting}
                >
                  <Text style={styles.saveBtnText}>{isSubmitting ? 'Creating...' : 'Create'}</Text>
                </TouchableOpacity>
              </View>
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
  typeSelectorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeChip: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.textMuted,
  },
  typeChipTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  addButton: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...elevation,
  },
  addButtonText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primary,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation,
  },
  categoryRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryInfo: {
    marginBottom: spacing.xs,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryName: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  categoryDetail: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  builtinBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
  },
  builtinBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  archivedBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.subtleWarning,
  },
  archivedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.text,
  },
  archiveBtn: {
    backgroundColor: colors.subtleWarning,
    borderColor: colors.warning,
  },
  unarchiveBtn: {
    backgroundColor: colors.subtleGreen,
    borderColor: colors.income,
  },
  deleteBtn: {
    backgroundColor: colors.subtleRed,
    borderColor: colors.expense,
  },
  deleteBtnText: {
    color: colors.expense,
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
    maxWidth: 400,
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
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
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
  pickerBox: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  pickerItem: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerItemActive: {
    backgroundColor: colors.subtleGreen,
  },
  pickerItemText: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  pickerItemTextActive: {
    fontWeight: '700',
    color: colors.primary,
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
    marginTop: spacing.sm,
  },
  modalBtn: {
    minHeight: 48,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  cancelBtn: {
    backgroundColor: colors.surfaceElevated,
  },
  cancelBtnText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  saveBtn: {
    backgroundColor: colors.primary,
  },
  saveBtnText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  dangerBtn: {
    backgroundColor: colors.expense,
  },
  dangerBtnText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});
