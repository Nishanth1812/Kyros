import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { refreshAmountError } from '../lib/money';
import { validateBudgetForm } from '../lib/budgetForm';
import type { Category, NewBudgetInput } from '../storage';
import { colors, elevation, fontSize, radius, spacing } from '../theme/theme';

export interface BudgetFormValues {
  /** null is the overall limit; any other value is an expense category id. */
  categoryId: number | null;
  amountMinor: number;
}

export interface BudgetFormProps {
  /** Only expense categories are offered as scopes. */
  categories: Category[];
  /** Preselected scope when creating; ignored when `initialValues` is provided. */
  initialCategoryId?: number | null;
  /** Existing limit to edit; locks the scope selection. */
  initialValues?: BudgetFormValues;
  /** Persist the limit. Throwing keeps the form open and shows the error. */
  onSave: (input: NewBudgetInput) => Promise<void>;
  /** Remove the edited limit. Only rendered when editing an existing limit. */
  onDelete?: () => Promise<boolean>;
  onCancel: () => void;
}

type FieldErrors = { amountMinor?: string; form?: string };

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not update the budget. Please try again.';
}

/** Render integer paise as the rupee text the amount field expects. */
function amountMinorToInput(amountMinor: number): string {
  const rupees = Math.floor(amountMinor / 100);
  const paise = amountMinor % 100;
  return `${rupees}.${String(paise).padStart(2, '0')}`;
}

export default function BudgetForm({
  categories,
  initialCategoryId = null,
  initialValues,
  onSave,
  onDelete,
  onCancel,
}: BudgetFormProps) {
  const [categoryId, setCategoryId] = useState<number | null>(
    () => initialValues?.categoryId ?? initialCategoryId
  );
  const [amount, setAmount] = useState(() =>
    initialValues ? amountMinorToInput(initialValues.amountMinor) : ''
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  // React state updates are async, so a second tap before the re-render would
  // still read `busy` as false. Guard saves and removals synchronously.
  const busyRef = useRef(false);
  const editing = initialValues !== undefined;

  const handleAmountChange = (text: string) => {
    setAmount(text);
    setErrors((prev) => refreshAmountError(prev, text));
  };

  const handleSubmit = async () => {
    if (busyRef.current) return;

    const validation = validateBudgetForm(amount, categoryId, categories);
    if (!validation.ok) {
      setErrors({ [validation.field]: validation.message });
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      await onSave(validation.input);
      onCancel();
    } catch (error) {
      // Keep the typed amount and selected scope so a retry loses nothing.
      setErrors({ form: toMessage(error) });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busyRef.current || !onDelete) return;

    busyRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      if (await onDelete()) onCancel();
    } catch (error) {
      setErrors({ form: toMessage(error) });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const scopeLabel =
    categoryId === null
      ? 'Overall'
      : (categories.find((category) => category.id === categoryId)?.name ??
        'Selected category');

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {editing ? `Edit ${scopeLabel} limit` : 'Set a monthly limit'}
      </Text>

      <Text style={[styles.label, styles.labelSpaced]}>Applies to</Text>
      {editing ? (
        <View
          style={styles.lockedScope}
          accessible
          accessibilityLabel={`Budget scope: ${scopeLabel}`}
        >
          <Text style={styles.lockedScopeText}>{scopeLabel}</Text>
        </View>
      ) : (
        <View
          style={styles.scopeOptions}
          accessibilityRole="radiogroup"
          accessibilityLabel="Budget scope"
        >
          <Pressable
            onPress={() => {
              setCategoryId(null);
              setErrors({});
            }}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityLabel="Overall monthly limit"
            accessibilityState={{ selected: categoryId === null, disabled: busy }}
            style={({ pressed }) => [
              styles.option,
              categoryId === null ? styles.optionSelected : null,
              pressed && !busy ? styles.optionPressed : null,
            ]}
          >
            <Text
              style={[styles.optionText, categoryId === null ? styles.optionTextSelected : null]}
            >
              Overall
            </Text>
          </Pressable>
          {categories.map((category) => {
            const selected = categoryId === category.id;
            return (
              <Pressable
                key={category.id}
                onPress={() => {
                  setCategoryId(category.id);
                  setErrors({});
                }}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityLabel={`${category.name} category`}
                accessibilityState={{ selected, disabled: busy }}
                style={({ pressed }) => [
                  styles.option,
                  selected ? styles.optionSelected : null,
                  pressed && !busy ? styles.optionPressed : null,
                ]}
              >
                <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!editing && categories.length === 0 ? (
        <Text style={styles.helperText}>
          No expense categories yet. The overall limit is still available.
        </Text>
      ) : null}

      <Text style={[styles.label, styles.labelSpaced]}>Monthly limit (₹)</Text>
      <TextInput
        value={amount}
        onChangeText={handleAmountChange}
        keyboardType="decimal-pad"
        placeholder="0.00"
        maxLength={18}
        editable={!busy}
        accessibilityLabel="Monthly limit in rupees"
        accessibilityHint="Enter an amount in rupees and paise, for example 5000 or 5000.50"
        style={[styles.input, errors.amountMinor ? styles.inputError : null]}
      />
      {errors.amountMinor ? (
        <Text
          style={styles.errorText}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.amountMinor}
        </Text>
      ) : (
        <Text style={styles.helperText}>Indian rupees · up to 2 decimals (paise)</Text>
      )}

      {errors.form ? (
        <Text
          style={styles.formError}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.form}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => void handleSubmit()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Save limit' : 'Add limit'}
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && !busy ? styles.primaryButtonPressed : null,
            busy ? styles.buttonDisabled : null,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {editing ? 'Save limit' : 'Add limit'}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={onCancel}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Cancel budget edit"
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && !busy ? styles.secondaryButtonPressed : null,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>

      {editing && onDelete ? (
        <Pressable
          onPress={() => void handleDelete()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Remove limit"
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && !busy ? styles.deleteButtonPressed : null,
          ]}
        >
          <Text style={styles.deleteButtonText}>Remove limit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...elevation,
  },
  title: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
  },
  label: {
    fontSize: fontSize.label,
    fontWeight: '600',
    color: colors.text,
  },
  labelSpaced: {
    marginTop: spacing.lg,
  },
  scopeOptions: {
    marginTop: spacing.sm,
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
  lockedScope: {
    marginTop: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleGreen,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  lockedScopeText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.primary,
  },
  input: {
    marginTop: spacing.sm,
    minHeight: 50,
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
  helperText: {
    marginTop: spacing.xs,
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: fontSize.small,
    color: colors.danger,
  },
  formError: {
    marginTop: spacing.md,
    fontSize: fontSize.small,
    color: colors.danger,
  },
  actions: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  primaryButton: {
    minHeight: 48,
    minWidth: 130,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  deleteButton: {
    marginTop: spacing.md,
    minHeight: 48,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  deleteButtonPressed: {
    opacity: 0.7,
  },
  deleteButtonText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.danger,
  },
});
