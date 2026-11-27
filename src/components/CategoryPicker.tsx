import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Category, NewCategoryInput, TransactionType } from '../storage';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, fontSize, radius, spacing } from '../theme/theme';

export interface CategoryPickerProps {
  /** Categories for the transaction's current type, chosen by the form. */
  categories: Category[];
  type: TransactionType;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreateCategory: (input: NewCategoryInput) => Promise<Category>;
  onEditCategories?: () => void;
  disabled?: boolean;
}

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not create the category. Please try again.';
}

export default function CategoryPicker({
  categories,
  type,
  selectedId,
  onSelect,
  onCreateCategory,
  onEditCategories,
  disabled = false,
}: CategoryPickerProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  // This component owns only the new-category draft. Transaction fields live
  // in TransactionForm, so creating a category never clears the unsaved entry.
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const optionsDisabled = disabled || saving;

  const handleCreate = async () => {
    if (savingRef.current || disabled) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a category name.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const created = await onCreateCategory({ type, name: trimmed });
      onSelect(created.id);
      setName('');
      setShowCreate(false);
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.options}
        accessibilityRole="radiogroup"
        accessibilityLabel="Category"
      >
        {categories.map((category) => {
          const selected = selectedId === category.id;
          return (
            <Pressable
              key={category.id}
              onPress={() => onSelect(category.id)}
              disabled={optionsDisabled}
              accessibilityRole="radio"
              accessibilityLabel={`${category.name}${category.isBuiltin ? ', built-in' : ', custom'}`}
              accessibilityState={{ selected, disabled: optionsDisabled }}
              style={({ pressed }) => [
                styles.option,
                selected ? styles.optionSelected : null,
                pressed && !optionsDisabled ? styles.optionPressed : null,
              ]}
            >
              <Text
                style={[styles.optionText, selected ? styles.optionTextSelected : null]}
              >
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {categories.length === 0 ? (
        <Text style={styles.helperText}>
          No categories for this type yet. {onEditCategories ? 'Edit categories to add one.' : 'Add one below.'}
        </Text>
      ) : null}

      {onEditCategories ? (
        <Pressable
          onPress={onEditCategories}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Edit categories"
          accessibilityState={{ disabled }}
          style={({ pressed }) => [styles.newCategoryButton, pressed && !disabled ? styles.newCategoryPressed : null]}
        >
          <Text style={styles.newCategoryText}>Edit categories</Text>
        </Pressable>
      ) : showCreate ? (
        <View style={styles.createBox}>
          <TextInput
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError(null);
            }}
            placeholder="Category name"
            maxLength={40}
            editable={!disabled && !saving}
            accessibilityLabel="New category name"
            accessibilityHint="Enter a name for the new category"
            style={[styles.input, error ? styles.inputError : null]}
          />
          {error ? (
            <Text
              style={styles.errorText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          ) : null}
          <View style={styles.createActions}>
            <Pressable
              onPress={() => void handleCreate()}
              disabled={disabled || saving}
              accessibilityRole="button"
              accessibilityLabel="Add category"
              accessibilityState={{ disabled: disabled || saving }}
              style={({ pressed }) => [
                styles.createButton,
                pressed && !disabled && !saving ? styles.createButtonPressed : null,
                saving ? styles.buttonDisabled : null,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.createButtonText}>Add category</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setName('');
                setError(null);
                setShowCreate(false);
              }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel new category"
              accessibilityState={{ disabled: saving }}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && !saving ? styles.cancelButtonPressed : null,
              ]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setError(null);
            setShowCreate(true);
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Create a custom category"
          accessibilityState={{ disabled }}
          style={({ pressed }) => [
            styles.newCategoryButton,
            pressed && !disabled ? styles.newCategoryPressed : null,
          ]}
        >
          <Text style={styles.newCategoryText}>+ New category</Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginTop: spacing.sm,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: {
    backgroundColor: colors.subtleGreen,
    borderColor: colors.primary,
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionText: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textMuted,
  },
  optionTextSelected: {
    color: colors.primary,
  },
  helperText: {
    marginTop: spacing.sm,
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  newCategoryButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  newCategoryPressed: {
    opacity: 0.7,
  },
  newCategoryText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.primary,
  },
  createBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: colors.errorBackground,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: fontSize.small,
    color: colors.danger,
  },
  createActions: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  createButton: {
    minHeight: 48,
    minWidth: 110,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  createButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: colors.onPrimary,
    fontSize: fontSize.small,
    fontWeight: '700',
  },
  cancelButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  cancelButtonPressed: {
    opacity: 0.7,
  },
  cancelText: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
