import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  Category,
  NewCategoryInput,
  NewTransactionInput,
  Transaction,
} from '../storage';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, fontSize, radius, spacing } from '../theme/theme';
import TransactionForm from './TransactionForm';

export interface EditTransactionModalProps {
  /** The row being edited, or null when the modal is closed. */
  transaction: Transaction | null;
  categories: Category[];
  onClose: () => void;
  /** Persist the edit; throwing keeps the modal open and shows the form error. */
  onSubmit: (input: NewTransactionInput) => Promise<void>;
  onCreateCategory: (input: NewCategoryInput) => Promise<Category>;
}

export default function EditTransactionModal({
  transaction,
  categories,
  onClose,
  onSubmit,
  onCreateCategory,
}: EditTransactionModalProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  if (!transaction) return null;

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      accessibilityLabel="Edit transaction"
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Edit transaction
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close edit transaction"
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? styles.closeButtonPressed : null,
            ]}
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <TransactionForm
            key={transaction.id}
            categories={categories}
            initialValues={transaction}
            onCreateCategory={onCreateCategory}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              await onSubmit(input);
              onClose();
            }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
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
  title: {
    flex: 1,
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  closeText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.primary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
