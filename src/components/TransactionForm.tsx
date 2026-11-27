import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { todayISO } from '../lib/dates';
import { parseAmountToMinorUnits, refreshAmountError } from '../lib/money';
import {
  validateTransactionInput,
  type Category,
  type NewCategoryInput,
  type NewTransactionInput,
  type TransactionType,
  type ValidationField,
} from '../storage';
import { touchTargetStyle } from '../theme/layout';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';
import CategoryPicker from './CategoryPicker';

type FieldErrors = Partial<Record<ValidationField | 'form', string>>;

/** Editable transaction fields; a full Transaction satisfies this shape. */
export interface TransactionFormValues {
  type: TransactionType;
  amountMinor: number;
  date: string;
  description: string | null;
  categoryId: number;
}

export interface TransactionFormProps {
  categories: Category[];
  onSubmit: (input: NewTransactionInput) => Promise<void>;
  onCreateCategory: (input: NewCategoryInput) => Promise<Category>;
  onEditCategories?: (type: TransactionType) => void;
  /** Omit to create; provide a transaction to edit its values in place. */
  initialValues?: TransactionFormValues;
  submitLabel?: string;
}

const OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not save the transaction. Please try again.';
}

/** Render integer minor units as the rupee text the amount field expects. */
function amountMinorToInput(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : '';
  const absolute = Math.abs(amountMinor);
  const rupees = Math.floor(absolute / 100);
  const paise = absolute % 100;
  return `${sign}${rupees}.${String(paise).padStart(2, '0')}`;
}

export default function TransactionForm({
  categories,
  onSubmit,
  onCreateCategory,
  onEditCategories,
  initialValues,
  submitLabel = 'Save transaction',
}: TransactionFormProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [type, setType] = useState<TransactionType>(
    () => initialValues?.type ?? 'expense'
  );
  const [amount, setAmount] = useState(() =>
    initialValues ? amountMinorToInput(initialValues.amountMinor) : ''
  );
  const [date, setDate] = useState(() => initialValues?.date ?? todayISO());
  const [description, setDescription] = useState(
    () => initialValues?.description ?? ''
  );
  const [categoryId, setCategoryId] = useState<number | null>(
    () => initialValues?.categoryId ?? null
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard against double taps: React state updates are async, so
  // the `submitting` flag alone still reads false for a second tap that lands
  // before the re-render.
  const submittingRef = useRef(false);

  // Re-seed the form when a caller swaps the transaction being edited. The
  // signature keeps this stable for object literals that are recreated on
  // every parent render.
  const initialSignature = initialValues
    ? `${initialValues.type}|${initialValues.amountMinor}|${initialValues.date}|${initialValues.description ?? ''}|${initialValues.categoryId}`
    : '';
  useEffect(() => {
    setType(initialValues?.type ?? 'expense');
    setAmount(initialValues ? amountMinorToInput(initialValues.amountMinor) : '');
    setDate(initialValues?.date ?? todayISO());
    setDescription(initialValues?.description ?? '');
    setCategoryId(initialValues?.categoryId ?? null);
    setErrors({});
    submittingRef.current = false;
    setSubmitting(false);
    // initialValues is represented by initialSignature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSignature]);

  const categoriesForType = categories.filter((category) => category.type === type);

  // Categories can arrive after the form mounts, and switching type can leave
  // the previous selection invalid. Keep exactly one valid default selected.
  useEffect(() => {
    if (categoryId !== null) return;
    const first = categories.find((category) => category.type === type);
    if (first) setCategoryId(first.id);
  }, [categories, type, categoryId]);

  const handleAmountChange = (text: string) => {
    setAmount(text);
    // Keep the visible amount error in sync with the current text: clear it
    // once the value is valid, refresh it if the edit is still invalid, and
    // leave date/description/form errors alone.
    setErrors((prev) => refreshAmountError(prev, text));
  };

  const handleTypeChange = (next: TransactionType) => {
    setType(next);
    setCategoryId((current) => {
      if (current === null) return null;
      const stillValid = categories.some(
        (category) => category.id === current && category.type === next
      );
      return stillValid ? current : null;
    });
    setErrors((prev) => {
      if (!prev.categoryId) return prev;
      const nextErrors = { ...prev };
      delete nextErrors.categoryId;
      return nextErrors;
    });
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;

    const parsedAmount = parseAmountToMinorUnits(amount);
    const validation = validateTransactionInput({
      type,
      amountMinor: parsedAmount.ok ? parsedAmount.amountMinor : undefined,
      date,
      description,
    });

    const nextErrors: FieldErrors = {};
    for (const issue of validation.errors) {
      if (issue.field !== 'amountMinor') nextErrors[issue.field] = issue.message;
    }
    if (!parsedAmount.ok) {
      nextErrors.amountMinor = parsedAmount.error;
    } else {
      const amountIssue = validation.errors.find(
        (issue) => issue.field === 'amountMinor'
      );
      if (amountIssue) nextErrors.amountMinor = amountIssue.message;
    }
    const categoryIsAvailable = categoriesForType.some((category) => category.id === categoryId);
    if (!categoryIsAvailable) nextErrors.categoryId = 'Choose a category.';
    setErrors(nextErrors);

    if (!validation.ok || !validation.value || !parsedAmount.ok || categoryId === null || !categoryIsAvailable) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({ ...validation.value, categoryId });
      // Creating a new entry starts fresh; editing keeps the values on screen
      // so a failed close or a retry never loses what the user typed.
      if (!initialValues) {
        setAmount('');
        setDescription('');
        setDate(todayISO());
        setCategoryId(categoriesForType[0]?.id ?? null);
      }
      setErrors({});
    } catch (error) {
      setErrors({ form: toMessage(error) });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={[styles.label, styles.primaryLabel]}>Amount (₹)</Text>
      <TextInput
        value={amount}
        onChangeText={handleAmountChange}
        keyboardType="decimal-pad"
        placeholder="0.00"
        maxLength={18}
        editable={!submitting}
        accessibilityLabel="Amount in rupees"
        accessibilityHint="Enter an amount in rupees and paise, for example 125 or 125.50"
        style={[
          styles.input,
          styles.amountInput,
          errors.amountMinor ? styles.inputError : null,
        ]}
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

      <Text style={[styles.label, styles.labelSpaced]}>Transaction type</Text>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {OPTIONS.map((option) => {
          const selected = type === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => handleTypeChange(option.value)}
              disabled={submitting}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, disabled: submitting }}
              style={[
                styles.segmentOption,
                selected &&
                  (option.value === 'income'
                    ? styles.segmentIncome
                    : styles.segmentExpense),
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  selected && styles.segmentTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, styles.labelSpaced]}>Category</Text>
      <CategoryPicker
        categories={categoriesForType}
        type={type}
        selectedId={categoryId}
        onSelect={(id) => {
          setCategoryId(id);
          setErrors((prev) => {
            if (!prev.categoryId) return prev;
            const nextErrors = { ...prev };
            delete nextErrors.categoryId;
            return nextErrors;
          });
        }}
        onCreateCategory={onCreateCategory}
        onEditCategories={onEditCategories ? () => onEditCategories(type) : undefined}
        disabled={submitting}
      />
      {errors.categoryId ? (
        <Text
          style={styles.errorText}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.categoryId}
        </Text>
      ) : null}

      <Text style={[styles.label, styles.labelSpaced]}>Date</Text>
      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        maxLength={10}
        autoCapitalize="none"
        editable={!submitting}
        accessibilityLabel="Date in YYYY-MM-DD format"
        accessibilityHint="Enter a calendar date, for example 2026-11-21"
        style={[styles.input, errors.date ? styles.inputError : null]}
      />
      {errors.date ? (
        <Text
          style={styles.errorText}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.date}
        </Text>
      ) : (
        <Text style={styles.helperText}>Format: YYYY-MM-DD</Text>
      )}

      <Text style={[styles.label, styles.labelSpaced]}>Description (optional)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What was this for?"
        multiline
        maxLength={120}
        editable={!submitting}
        accessibilityLabel="Description, optional"
        style={[styles.input, styles.multiline, errors.description ? styles.inputError : null]}
      />
      {errors.description ? (
        <Text
          style={styles.errorText}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.description}
        </Text>
      ) : null}

      {errors.form ? (
        <Text
          style={styles.formError}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.form}
        </Text>
      ) : null}

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: submitting }}
        style={({ pressed }) => [
          styles.submitButton,
          pressed && !submitting ? styles.submitPressed : null,
          submitting ? styles.submitDisabled : null,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.submitText}>{submitLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...elevation,
  },
  label: {
    fontSize: fontSize.label,
    fontWeight: '600',
    color: colors.text,
  },
  labelSpaced: {
    marginTop: spacing.lg,
  },
  primaryLabel: {
    fontSize: fontSize.heading,
  },
  segment: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentOption: {
    ...touchTargetStyle,
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  segmentExpense: {
    backgroundColor: colors.subtleRed,
    borderColor: colors.expense,
  },
  segmentIncome: {
    backgroundColor: colors.subtleGreen,
    borderColor: colors.income,
  },
  segmentText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentTextSelected: {
    color: colors.text,
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
  amountInput: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: 'top',
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
  submitButton: {
    ...touchTargetStyle,
    marginTop: spacing.xl,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  submitPressed: {
    backgroundColor: colors.primaryDark,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: colors.onPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
});
